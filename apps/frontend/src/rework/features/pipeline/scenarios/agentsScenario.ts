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
import { PROMPT_PROBE, SELF_TEST_AGENT_ID, SYSTEM_PROMPT_MARKER_BASE } from "./corpus";
import { cleanup, newRunScope } from "./runScope";

/** Agents family: a run-scoped instance of the deterministic agent, which echoes its system prompt. */
export const agentsScenario: Scenario = async (deps, report, signal) => {
  const scope = newRunScope();
  const systemMarker = scope.name(SYSTEM_PROMPT_MARKER_BASE);
  let agentInstanceId: string | null = null;

  try {
    agentInstanceId = await runStep(report, "provision-agent", "Provision the self-test agent", async () => {
      const id = await deps.provisionAgentInstance(SELF_TEST_AGENT_ID, { "prompts.system": systemMarker }, signal);
      if (!id) throw new SkipStep(`template '${SELF_TEST_AGENT_ID}' is not available on this deployment`);
      return { value: id, detail: id };
    });
    await runStep(report, "query-system-prompt", "The system prompt set at enrollment is delivered", async () => {
      if (!agentInstanceId) throw new SkipStep("agent instance missing");
      const turn = await deps.runAgentTurn({ agentInstanceId, question: PROMPT_PROBE, libraryIds: [], signal });
      if (!turn.answer.includes(systemMarker)) {
        throw new Error(`system prompt marker '${systemMarker}' not delivered (${turn.answer.slice(-100)})`);
      }
      return { value: undefined, detail: "system prompt echoed back" };
    });
  } finally {
    await cleanup(report, "delete-agent", "Delete the self-test agent", agentInstanceId, deps.deleteAgentInstance);
  }
};
