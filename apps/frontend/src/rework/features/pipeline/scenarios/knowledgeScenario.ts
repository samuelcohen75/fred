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
import { runStep, SkipStep } from "../step";
import type { Scenario } from "../types";
import { ALPHA, BETA, BETA_MARKER, fileOf, MARKER, PROBE, SELF_TEST_AGENT_ID } from "./corpus";
import { cleanup, newRunScope } from "./runScope";

/**
 * Knowledge family: documents ingested in the personal space, retrieved through
 * the real execution pipeline. The marker lives in ALPHA only, so "found in
 * ALPHA, absent from BETA" is deterministic even though real retrieval answered.
 */
export const knowledgeScenario: Scenario = async (deps, report, signal) => {
  const scope = newRunScope();
  let alpha: string | null = null;
  let beta: string | null = null;
  let agentInstanceId: string | null = null;

  try {
    alpha = await runStep(report, "create-alpha", "Create folder ALPHA", async () => {
      const id = await deps.createLibrary(scope.name(ALPHA.library));
      return { value: id, detail: `${scope.name(ALPHA.library)} (${id})` };
    });
    beta = await runStep(report, "create-beta", "Create folder BETA", async () => {
      const id = await deps.createLibrary(scope.name(BETA.library));
      return { value: id, detail: `${scope.name(BETA.library)} (${id})` };
    });
    agentInstanceId = await runStep(report, "provision-agent", "Provision the self-test agent", async () => {
      const id = await deps.provisionAgentInstance(SELF_TEST_AGENT_ID, undefined, signal);
      if (!id) throw new SkipStep(`template '${SELF_TEST_AGENT_ID}' is not available on this deployment`);
      return { value: id, detail: id };
    });
    await runStep(report, "ingest-alpha", "Upload and index a document into ALPHA", async () => {
      if (!alpha) throw new SkipStep("ALPHA folder missing");
      await deps.ingestDocument(alpha, fileOf(ALPHA), signal);
      return { value: undefined, detail: ALPHA.fileName };
    });
    await runStep(report, "ingest-beta", "Upload and index a document into BETA", async () => {
      if (!beta) throw new SkipStep("BETA folder missing");
      await deps.ingestDocument(beta, fileOf(BETA), signal);
      return { value: undefined, detail: BETA.fileName };
    });
    await runStep(report, "query-alpha", "Ask the agent about ALPHA: the marker must be found", async () => {
      if (!alpha || !agentInstanceId) throw new SkipStep("ALPHA folder or agent instance missing");
      const turn = await deps.runAgentTurn({ agentInstanceId, question: PROBE, libraryIds: [alpha], signal });
      if (!turn.answer.includes(MARKER)) {
        throw new Error(`marker '${MARKER}' not in the agent answer (${turn.answer.slice(0, 80)}…)`);
      }
      return { value: undefined, detail: `marker retrieved (${turn.sources.length} source(s))` };
    });
    await runStep(report, "query-beta", "Ask the agent about BETA: B retrieved, ALPHA marker absent", async () => {
      if (!beta || !agentInstanceId) throw new SkipStep("BETA folder or agent instance missing");
      const turn = await deps.runAgentTurn({ agentInstanceId, question: PROBE, libraryIds: [beta], signal });
      // Absence of MARKER means isolation only if B retrieval actually ran and returned B content.
      if (turn.sources.length === 0 || !turn.answer.includes(BETA_MARKER)) {
        throw new Error(
          `BETA retrieval did not return B content (sources=${turn.sources.length}); the ALPHA marker's absence proves nothing`,
        );
      }
      if (turn.answer.includes(MARKER)) throw new Error(`marker '${MARKER}' leaked into the BETA scope`);
      return { value: undefined, detail: `B retrieved (${turn.sources.length} source(s)), ALPHA marker absent` };
    });
  } finally {
    await cleanup(report, "delete-agent", "Delete the self-test agent", agentInstanceId, deps.deleteAgentInstance);
    await cleanup(report, "delete-alpha", "Delete folder ALPHA and its document", alpha, deps.deleteLibrary);
    await cleanup(report, "delete-beta", "Delete folder BETA and its document", beta, deps.deleteLibrary);
    await runStep(
      report,
      "verify-deletion",
      "Verify the folders are gone",
      async () => {
        const created = [alpha, beta].filter((id): id is string => id != null);
        if (created.length === 0) throw new SkipStep("nothing was created");
        const ids = new Set((await deps.listLibraries()).map((l) => l.id));
        const remaining = created.filter((id) => ids.has(id));
        if (remaining.length) throw new Error(`${remaining.length} folder(s) still present after delete`);
        return { value: undefined, detail: "all created folders removed" };
      },
      { optional: true },
    );
  }
};
