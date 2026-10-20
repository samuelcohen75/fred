// Copyright Thales 2026
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useCallback } from "react";
import { identityProbeScenario } from "./scenarios/identityProbeScenario";
import { runStep } from "./step";
import { authzProbeScenario, type AuthzProbeDeps } from "./scenarios/authzProbeScenario";
import { loginWithPassword } from "./keycloakDirectGrant";
import type { StepReport } from "./types";
import { useRunner } from "./useScenarioRun";
import { KeyCloakService } from "../../../security/KeycloakService";
import { isPersonalTeamId } from "../../components/shared/utils/teamId";
import type { PermissionSummary, Team } from "../../../slices/controlPlane/controlPlaneOpenApi";

interface TeamWithPermissionsResponse {
  permissions?: string[];
}

interface PromptResponse {
  id?: string;
}

interface BootstrapResponse {
  permissions?: PermissionSummary;
}

export async function authedFetch(
  path: string,
  token?: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // no body, or not JSON — the callers below only care about status in that case
  }
  return { status: response.status, body };
}

/** The real `AuthzProbeDeps` — plain authenticated fetches against the same
 * relative control-plane paths the generated RTK Query client uses, bound to
 * an explicit token instead of the app's own session (see the module doc in
 * `scenarios/authzProbeScenario.ts` for why). */
export const authzProbeDeps: AuthzProbeDeps = {
  fetchBootstrapFlags: async (token) => {
    const { status, body } = await authedFetch("/control-plane/v1/frontend/bootstrap", token);
    if (status !== 200) throw new Error(`GET /frontend/bootstrap: HTTP ${status}`);
    const roles = (body as BootstrapResponse)?.permissions?.platform_roles ?? [];
    return {
      isPlatformAdmin: roles.includes("platform_admin"),
      isPlatformObserver: roles.includes("platform_observer"),
    };
  },
  fetchOwnTeamIds: async (token) => {
    const { status, body } = await authedFetch("/control-plane/v1/teams", token);
    if (status !== 200) throw new Error(`GET /teams: HTTP ${status}`);
    const teams = Array.isArray(body) ? (body as Team[]) : [];
    // TEAM-10: a PUBLIC team (the default) is listed for marketplace discovery
    // even for a non-member (`can_read = team_member or public`) — list
    // presence alone is not membership. Filter to `is_member` so the
    // foreign-team-isolation check downstream can still find a genuinely
    // foreign team instead of treating every public team as "owned."
    return teams
      .filter((t) => t.is_member)
      .map((t) => String(t.id))
      .filter((id) => !isPersonalTeamId(id));
  },
  probeRegistryAccess: async (token) => {
    const { status, body } = await authedFetch("/control-plane/v1/teams/all", token);
    const teams = status === 200 && Array.isArray(body) ? (body as Team[]) : [];
    return { status, teamIds: teams.map((t) => String(t.id)) };
  },
  probeUsersAccess: async (token) => {
    const { status } = await authedFetch("/control-plane/v1/users", token);
    return status;
  },
  probeTeamPromptsAccess: async (token, teamId) => {
    const { status } = await authedFetch(`/control-plane/v1/teams/${encodeURIComponent(teamId)}/prompts`, token);
    return status;
  },
  fetchTeamPermissions: async (token, teamId) => {
    const { status, body } = await authedFetch(`/control-plane/v1/teams/${encodeURIComponent(teamId)}`, token);
    if (status !== 200) return [];
    return (body as TeamWithPermissionsResponse)?.permissions ?? [];
  },
  probeTeamWriteAccess: async (token, teamId) => {
    const marker = (globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 8);
    const { status, body } = await authedFetch(`/control-plane/v1/teams/${encodeURIComponent(teamId)}/prompts`, token, {
      method: "POST",
      body: {
        name: `fred-authz-selftest-${marker}`,
        text: "Authorization self-test probe — safe to delete, cleaned up automatically.",
      },
    });
    const allowed = status === 200 || status === 201;
    return { status, createdId: allowed ? ((body as PromptResponse)?.id ?? null) : null };
  },
  cleanupTeamWrite: async (token, teamId, promptId) => {
    try {
      await authedFetch(
        `/control-plane/v1/teams/${encodeURIComponent(teamId)}/prompts/${encodeURIComponent(promptId)}`,
        token,
        {
          method: "DELETE",
        },
      );
    } catch {
      // Best-effort — a failed cleanup must not crash the self-test. The prompt
      // is clearly named (`fred-authz-selftest-*`) and safe to remove manually.
    }
  },
};

export interface AuthzProbeRun {
  steps: StepReport[];
  isRunning: boolean;
  /** Run the probe against the current admin's own session — always available. */
  runForMyself: () => Promise<void>;
  runIdentity: () => Promise<void>;
  /** Log in as `username`/`password` (short-lived, discarded after the run — see
   * `keycloakDirectGrant.ts`) and run the same probe against that account. */
  runForProfile: (username: string, password: string) => Promise<void>;
}

export function useAuthzProbeRun(): AuthzProbeRun {
  const { steps, isRunning, run } = useRunner();

  const runForMyself = useCallback(
    () =>
      run(async (report) => {
        const token = KeyCloakService.GetToken();
        if (token) await authzProbeScenario(token, token, authzProbeDeps, report);
      }),
    [run],
  );

  const runIdentity = useCallback(
    () =>
      run(async (report) => {
        const token = await runStep(report, "identity-session", "Refresh the current session credential", async () => {
          if (!(await KeyCloakService.ensureFreshToken(30)))
            throw new Error("Sign in again before running the JWT checks");
          const value = KeyCloakService.GetToken();
          if (!value) throw new Error("No session credential");
          return { value };
        });
        if (token) await identityProbeScenario(token, KeyCloakService.GetUserId(), authedFetch, report);
      }),
    [run],
  );

  const runForProfile = useCallback(
    (username: string, password: string) =>
      run(async (report) => {
        const adminToken = KeyCloakService.GetToken();
        const realmConfig = KeyCloakService.GetKeycloakRealmConfig();
        if (!adminToken || !realmConfig) return;
        const targetToken = await runStep(report, "login-as", `Log in as ${username}`, async () => {
          const token = await loginWithPassword(realmConfig, username, password);
          return { value: token, detail: `authenticated as ${username}` };
        });
        if (targetToken) await authzProbeScenario(adminToken, targetToken, authzProbeDeps, report);
      }),
    [run],
  );

  return { steps, isRunning, runForMyself, runForProfile, runIdentity };
}
