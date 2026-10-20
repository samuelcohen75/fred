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
import { CONTEXT_PROMPT_MARKER_BASE, PROMPT_PROBE, SELF_TEST_AGENT_ID } from "./corpus";
import { cleanup, newRunScope } from "./runScope";

/** Prompts family: a personal prompt attached to a session reaches the agent, which echoes it. */
export const promptsScenario: Scenario = async (deps, report, signal) => {
  const scope = newRunScope();
  const contextMarker = scope.name(CONTEXT_PROMPT_MARKER_BASE);
  let agentInstanceId: string | null = null;
  let promptId: string | null = null;
  let sessionId: string | null = null;

  try {
    agentInstanceId = await runStep(report, "provision-agent", "Provision the self-test agent", async () => {
      const id = await deps.provisionAgentInstance(SELF_TEST_AGENT_ID, undefined, signal);
      if (!id) throw new SkipStep(`template '${SELF_TEST_AGENT_ID}' is not available on this deployment`);
      return { value: id, detail: id };
    });
    promptId = await runStep(report, "create-prompt", "Create a personal context prompt", async () => {
      const id = await deps.createContextPrompt(
        scope.name("fred-selftest-prompt"),
        `Self-test context prompt. Delivery marker: ${contextMarker}`,
      );
      return { value: id, detail: id };
    });
    sessionId = await runStep(report, "create-session", "Create a chat session", async () => {
      if (!agentInstanceId) throw new SkipStep("agent instance missing");
      const id = await deps.createSession(agentInstanceId);
      return { value: id, detail: id };
    });
    await runStep(report, "attach-prompt", "Attach the prompt to the session", async () => {
      if (!sessionId || !promptId) throw new SkipStep("session or prompt missing");
      await deps.attachSessionPrompts(sessionId, [promptId]);
      return { value: undefined, detail: `prompt ${promptId} attached to session ${sessionId}` };
    });
    await runStep(report, "query-context-prompt", "The attached prompt is delivered to the agent", async () => {
      if (!agentInstanceId || !sessionId) throw new SkipStep("agent instance or session missing");
      const turn = await deps.runAgentTurn({
        agentInstanceId,
        question: PROMPT_PROBE,
        libraryIds: [],
        sessionId,
        signal,
      });
      if (!turn.answer.includes(contextMarker)) {
        throw new Error(`context prompt marker '${contextMarker}' not delivered (${turn.answer.slice(-120)})`);
      }
      return { value: undefined, detail: "context prompt echoed back" };
    });
  } finally {
    await cleanup(report, "delete-session", "Delete the chat session", sessionId, deps.deleteSession);
    await cleanup(report, "delete-prompt", "Delete the context prompt", promptId, deps.deleteContextPrompt);
    await cleanup(report, "delete-agent", "Delete the self-test agent", agentInstanceId, deps.deleteAgentInstance);
  }
};
