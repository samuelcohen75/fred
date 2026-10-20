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
// Test-only, in-memory stand-in for the platform the families drive. Its agent
// behaves like the deterministic self-test agent: it echoes retrieved text and
// the prompts it received.
import type { PipelineDeps, Reporter, StepReport } from "../types";
import type { AgentsDeps } from "./agentsScenario";
import type { KnowledgeDeps } from "./knowledgeScenario";
import { PROBE, PROMPT_PROBE, SELF_TEST_AGENT_ID } from "./corpus";

export interface FakeDocument {
  uid: string;
  name: string;
  text: string;
  libraries: Set<string>;
  retrievable: boolean;
}

export class FakePlatform {
  libraries = new Map<string, string>();
  documents: FakeDocument[] = [];
  agents = new Map<string, { template: string; name: string; system: string; enabled: boolean }>();
  prompts = new Map<string, { name: string; text: string }>();
  sessions = new Map<string, { agent: string; title: string; prompts: string[] }>();
  templates = new Set([SELF_TEST_AGENT_ID]);
  failures = new Set<string>();
  private next = 0;

  id(prefix: string): string {
    this.next += 1;
    return `${prefix}-${this.next}`;
  }

  fail(name: string): void {
    if (this.failures.has(name)) throw new Error(`${name} failed`);
  }

  answer(agentId: string, question: string, libraryIds: string[], sessionId?: string | null) {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.enabled) throw Object.assign(new Error("agent unavailable"), { status: 409 });
    if (question === PROMPT_PROBE) {
      const session = sessionId ? this.sessions.get(sessionId) : undefined;
      const context = (session?.prompts ?? []).map((id) => this.prompts.get(id)?.text ?? "").join("\n");
      return { answer: `system_prompt: ${agent.system}\ncontext_prompt: ${context}`, sources: [] };
    }
    if (question === PROBE) {
      const hits = this.search(libraryIds);
      return { answer: hits.map((d) => d.text).join("\n"), sources: hits.map((d) => d.uid) };
    }
    return { answer: "", sources: [] };
  }

  search(libraryIds: string[]): FakeDocument[] {
    return this.documents.filter((d) => d.retrievable && libraryIds.some((l) => d.libraries.has(l)));
  }

  /** Documents whose chunks the index still returns after a delete (simulates residue). */
  residue: FakeDocument[] = [];
  auditAnomalies = 0;

  agentsDeps(): AgentsDeps {
    const base = this.deps();
    return {
      ...base,
      updateAgent: async (id, { system, enabled }) => {
        const agent = this.agents.get(id);
        if (!agent) throw Object.assign(new Error("not found"), { status: 404 });
        if (system !== undefined) agent.system = system;
        if (enabled !== undefined) agent.enabled = enabled;
      },
      listAgents: async () => [...this.agents].map(([id, a]) => ({ id, name: a.name })),
      effectiveModel: async () => ({ name: "chat-model", usable: true }),
      copyTargets: async () => [{ teamId: base.teamId, templateEnabled: true }],
      duplicate: async (id, name) => {
        const source = this.agents.get(id);
        if (!source) throw Object.assign(new Error("not found"), { status: 404 });
        const taken = new Set([...this.agents.values()].map((a) => a.name));
        if (name && taken.has(name)) return { agentId: null, name: null, errorCode: "agent_name_conflict" };
        let free = name ?? `${source.name} (copy)`;
        for (let n = 2; !name && taken.has(free); n++) free = `${source.name} (copy ${n})`;
        const copyId = this.id("agent");
        this.agents.set(copyId, { ...source, name: free });
        return { agentId: copyId, name: free, errorCode: null };
      },
    };
  }

  knowledgeDeps(): KnowledgeDeps {
    return {
      ...this.deps(),
      documentsIn: async (libraryId) =>
        this.documents.filter((d) => d.libraries.has(libraryId)).map((d) => ({ uid: d.uid, name: d.name })),
      search: async ({ libraryIds, documentUids }) => {
        this.fail("search");
        const pool = [...this.documents, ...this.residue].filter((d) => d.retrievable);
        const hits = pool.filter(
          (d) =>
            (!libraryIds || libraryIds.some((l) => d.libraries.has(l))) &&
            (!documentUids || documentUids.includes(d.uid)),
        );
        return hits.map((d) => ({ uid: d.uid, content: d.text }));
      },
      linkDocument: async (libraryId, uid) => {
        this.documents.find((d) => d.uid === uid)?.libraries.add(libraryId);
      },
      unlinkDocument: async (libraryId, uid) => {
        this.fail("unlink");
        this.documents.find((d) => d.uid === uid)?.libraries.delete(libraryId);
      },
      setRetrievable: async (uid, retrievable) => {
        const doc = this.documents.find((d) => d.uid === uid);
        if (doc) doc.retrievable = retrievable;
      },
      documentTree: async (libraryId) =>
        this.documents
          .filter((d) => d.libraries.has(libraryId))
          .map((d) => d.name)
          .join("\n"),
      tabularRows: async (_libraryId, uid, sql) => {
        const doc = this.documents.find((d) => d.uid === uid);
        if (!doc || !sql("alias").includes("alias")) return [];
        const [header, ...lines] = doc.text.trim().split("\n");
        const columns = header.split(",");
        return lines
          .map((line) => Object.fromEntries(line.split(",").map((v, i) => [columns[i], i === 0 ? Number(v) : v])))
          .filter((row) => row.code === 1)
          .map((row) => ({ label: row.label }));
      },
      audit: async () => ({ hasAnomalies: this.auditAnomalies > 0, detail: `${this.auditAnomalies} anomaly(ies)` }),
      sleep: async () => {},
    };
  }

  deps(): PipelineDeps {
    return {
      teamId: "personal-admin",
      createLibrary: async (name) => {
        this.fail("createLibrary");
        const id = this.id("lib");
        this.libraries.set(id, name);
        return id;
      },
      deleteLibrary: async (id) => {
        this.libraries.delete(id);
        this.documents = this.documents.filter((d) => {
          d.libraries.delete(id);
          return d.libraries.size > 0;
        });
      },
      listLibraries: async () => [...this.libraries].map(([id, name]) => ({ id, name })),
      ingestDocument: async (libraryId, file) => {
        this.fail(`ingest:${file.name}`);
        this.documents.push({
          uid: this.id("doc"),
          name: file.name,
          text: await file.text(),
          libraries: new Set([libraryId]),
          retrievable: true,
        });
      },
      provisionAgentInstance: async (template, tuning) => {
        if (!this.templates.has(template)) return null;
        const id = this.id("agent");
        const system = String(tuning?.["prompts.system"] ?? "");
        this.agents.set(id, { template, name: "Self-test (auto)", system, enabled: true });
        return id;
      },
      deleteAgentInstance: async (id) => {
        this.agents.delete(id);
      },
      createContextPrompt: async (name, text) => {
        const id = this.id("prompt");
        this.prompts.set(id, { name, text });
        return id;
      },
      deleteContextPrompt: async (id) => {
        this.prompts.delete(id);
      },
      createSession: async (agent) => {
        const id = this.id("session");
        this.sessions.set(id, { agent, title: "Self-test (auto)", prompts: [] });
        return id;
      },
      attachSessionPrompts: async (sessionId, promptIds) => {
        const session = this.sessions.get(sessionId);
        if (session) session.prompts = [...promptIds];
      },
      deleteSession: async (id) => {
        this.sessions.delete(id);
      },
      runAgentTurn: async ({ agentInstanceId, question, libraryIds, sessionId }) => {
        this.fail("runAgentTurn");
        const { answer, sources } = this.answer(agentInstanceId, question, libraryIds, sessionId);
        return { answer, sources, sessionId: sessionId ?? null, statusSeenAt: {} };
      },
    };
  }
}

/** Collects the last report of every step, in first-seen order. */
export function collect(): { steps: StepReport[]; report: Reporter; status: (id: string) => string } {
  const steps: StepReport[] = [];
  const report: Reporter = (step) => {
    const i = steps.findIndex((s) => s.id === step.id);
    if (i === -1) steps.push(step);
    else steps[i] = step;
  };
  return { steps, report, status: (id) => steps.find((s) => s.id === id)?.status ?? "missing" };
}

export const signal = new AbortController().signal;
