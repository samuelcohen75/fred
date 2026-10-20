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
import { agentsScenario } from "./agentsScenario";
import { knowledgeScenario } from "./knowledgeScenario";
import { promptsScenario } from "./promptsScenario";
import { collect, FakePlatform, signal } from "./fakePlatform";

describe("knowledgeScenario", () => {
  it("finds the marker in ALPHA, isolates BETA and removes every fixture", async () => {
    const platform = new FakePlatform();
    const run = collect();
    await knowledgeScenario(platform.deps(), run.report, signal);
    expect(run.steps.filter((s) => s.status === "failed")).toEqual([]);
    expect(run.status("query-alpha")).toBe("passed");
    expect(run.status("query-beta")).toBe("passed");
    expect(run.status("verify-deletion")).toBe("passed");
    expect(platform.libraries.size).toBe(0);
    expect(platform.agents.size).toBe(0);
  });

  it("fails isolation when the ALPHA marker leaks into BETA", async () => {
    const platform = new FakePlatform();
    const deps = platform.deps();
    const ingest = deps.ingestDocument;
    // Every document lands in both folders: BETA retrieval now returns ALPHA's marker.
    deps.ingestDocument = async (libraryId, file, s) => {
      await ingest(libraryId, file, s);
      const doc = platform.documents[platform.documents.length - 1];
      for (const id of platform.libraries.keys()) doc.libraries.add(id);
    };
    const run = collect();
    await knowledgeScenario(deps, run.report, signal);
    expect(run.status("query-beta")).toBe("failed");
  });

  it("skips the turns, and still cleans up, when the harness agent is missing", async () => {
    const platform = new FakePlatform();
    platform.templates.clear();
    const run = collect();
    await knowledgeScenario(platform.deps(), run.report, signal);
    expect(run.status("provision-agent")).toBe("skipped");
    expect(run.status("query-alpha")).toBe("skipped");
    expect(platform.libraries.size).toBe(0);
  });
});

describe("agentsScenario", () => {
  it("delivers the enrollment system prompt and deletes the instance", async () => {
    const platform = new FakePlatform();
    const run = collect();
    await agentsScenario(platform.deps(), run.report, signal);
    expect(run.status("query-system-prompt")).toBe("passed");
    expect(platform.agents.size).toBe(0);
  });
});

describe("promptsScenario", () => {
  it("delivers the attached prompt and deletes session, prompt and agent", async () => {
    const platform = new FakePlatform();
    const run = collect();
    await promptsScenario(platform.deps(), run.report, signal);
    expect(run.status("query-context-prompt")).toBe("passed");
    expect([platform.sessions.size, platform.prompts.size, platform.agents.size]).toEqual([0, 0, 0]);
  });

  it("fails when the session drops the attached prompt", async () => {
    const platform = new FakePlatform();
    const deps = platform.deps();
    deps.attachSessionPrompts = async () => {};
    const run = collect();
    await promptsScenario(deps, run.report, signal);
    expect(run.status("query-context-prompt")).toBe("failed");
  });
});
