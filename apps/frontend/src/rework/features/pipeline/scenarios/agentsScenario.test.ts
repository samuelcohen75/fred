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
import { describe, expect, it } from "vitest";
import { agentsScenario, CONCURRENT_SESSIONS } from "./agentsScenario";
import { collect, FakePlatform, signal } from "./fakePlatform";

async function run(platform: FakePlatform, deps = platform.agentsDeps()) {
  const r = collect();
  await agentsScenario(deps, r.report, signal);
  return r;
}

describe("agentsScenario", () => {
  it("passes every check and leaves no agent, session or prompt behind", async () => {
    const platform = new FakePlatform();
    const r = await run(platform);
    expect(r.steps.filter((s) => s.status !== "passed").map((s) => `${s.id}:${s.status}`)).toEqual([]);
    expect([platform.agents.size, platform.sessions.size, platform.prompts.size]).toEqual([0, 0, 0]);
  });

  it("fails when an update does not reach the following turns", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    const update = deps.updateAgent;
    deps.updateAgent = async (id, change) => update(id, { ...change, system: undefined });
    expect((await run(platform, deps)).status("tuning-update")).toBe("failed");
  });

  it("fails when a disabled agent still answers, and re-enables it anyway", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    const update = deps.updateAgent;
    const seen: boolean[] = [];
    deps.updateAgent = async (id, change) => {
      if (change.enabled !== undefined) seen.push(change.enabled);
      await update(id, { ...change, enabled: true });
    };
    expect((await run(platform, deps)).status("disabled-agent")).toBe("failed");
    expect(seen).toEqual([false, true]);
  });

  it("fails when the chosen name is not kept, and deletes the copy", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    const duplicate = deps.duplicate;
    deps.duplicate = async (id) => duplicate(id);
    const r = await run(platform, deps);
    expect(r.status("duplicate")).toBe("failed");
    expect(platform.agents.size).toBe(0);
  });

  it("fails when a taken name is accepted for a second duplicate, and deletes it", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    const duplicate = deps.duplicate;
    let calls = 0;
    deps.duplicate = async (id, name) => {
      calls += 1;
      // The second named duplicate gets a fresh copy instead of a refusal.
      if (calls === 2) return { ...(await duplicate(id)), name: name ?? null };
      return duplicate(id, name);
    };
    const r = await run(platform, deps);
    expect(r.status("duplicate-conflict")).toBe("failed");
    expect(platform.agents.size).toBe(0);
  });

  it("names both sessions when concurrent turns cross", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    const turn = deps.runAgentTurn;
    let first: string | null = null;
    deps.runAgentTurn = async (args) => {
      const result = await turn(args);
      if (!args.sessionId) return result;
      first ??= result.answer;
      // Every concurrent turn also receives the first session's context.
      return { ...result, answer: `${result.answer}\n${first}` };
    };
    const r = await run(platform, deps);
    const step = r.steps.find((s) => s.id === "concurrent-turns");
    expect(step?.status).toBe("failed");
    expect(step?.error).toMatch(/received the context of session/);
    expect(platform.sessions.size).toBe(0);
    expect(CONCURRENT_SESSIONS).toBeGreaterThan(1);
  });

  it("fails when the agent's model is not usable", async () => {
    const platform = new FakePlatform();
    const deps = platform.agentsDeps();
    deps.effectiveModel = async () => ({ name: "blocked", usable: false });
    expect((await run(platform, deps)).status("effective-model")).toBe("failed");
  });
});
