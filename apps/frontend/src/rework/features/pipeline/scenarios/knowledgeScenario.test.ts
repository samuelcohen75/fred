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
import { MARKER } from "./corpus";
import { collect, FakePlatform, signal } from "./fakePlatform";
import { formatFixtures, pdfBytes } from "./formats";
import { knowledgeScenario, SEARCH_POLICIES } from "./knowledgeScenario";

async function run(platform: FakePlatform, deps = platform.knowledgeDeps()) {
  const r = collect();
  await knowledgeScenario(deps, r.report, signal);
  return r;
}

describe("knowledgeScenario", () => {
  it("passes every check and removes every fixture", async () => {
    const platform = new FakePlatform();
    const r = await run(platform);
    expect(r.steps.filter((s) => s.status !== "passed").map((s) => `${s.id}:${s.status}`)).toEqual([]);
    for (const policy of SEARCH_POLICIES) expect(r.status(`search-${policy}`)).toBe("passed");
    for (const f of formatFixtures("x")) expect(r.status(`format-${f.id}`)).toBe("passed");
    expect(platform.libraries.size).toBe(0);
    expect(platform.documents).toEqual([]);
    expect(platform.agents.size).toBe(0);
  });

  it("fails isolation when the ALPHA marker leaks into BETA", async () => {
    const platform = new FakePlatform();
    const deps = platform.knowledgeDeps();
    const ingest = deps.ingestDocument;
    deps.ingestDocument = async (libraryId, file, s) => {
      await ingest(libraryId, file, s);
      const doc = platform.documents[platform.documents.length - 1];
      for (const id of platform.libraries.keys()) doc.libraries.add(id);
    };
    const r = await run(platform, deps);
    expect(r.status("query-beta")).toBe("failed");
    expect(r.status("search-isolation")).toBe("failed");
  });

  it("fails when an unlink does not take effect, without waiting for it", async () => {
    const platform = new FakePlatform();
    const deps = platform.knowledgeDeps();
    deps.unlinkDocument = async () => {};
    let slept = 0;
    deps.sleep = async () => {
      slept += 1;
    };
    const before = slept;
    const r = await run(platform, deps);
    expect(r.status("unlink-document")).toBe("failed");
    expect(slept).toBe(before);
  });

  it("fails one format and keeps checking the others", async () => {
    const platform = new FakePlatform();
    const pdf = formatFixtures("x").find((f) => f.id === "pdf")!;
    const deps = platform.knowledgeDeps();
    const ingest = deps.ingestDocument;
    deps.ingestDocument = async (libraryId, file, s) => {
      if (file.name.endsWith(".pdf")) throw new Error("no extractor for .pdf");
      await ingest(libraryId, file, s);
    };
    const r = await run(platform, deps);
    expect(r.status("format-pdf")).toBe("failed");
    expect(r.status("format-docx")).toBe("passed");
    expect(pdf.marker).toContain("pdf");
  });

  it("fails when a non-retrievable document is still returned", async () => {
    const platform = new FakePlatform();
    const deps = platform.knowledgeDeps();
    deps.setRetrievable = async () => {};
    expect((await run(platform, deps)).status("retrievable-off")).toBe("failed");
  });

  it("reports chunks that outlive their deleted document", async () => {
    const platform = new FakePlatform();
    const deps = platform.knowledgeDeps();
    const remove = deps.deleteLibrary;
    deps.deleteLibrary = async (id) => {
      platform.residue.push(...platform.documents.filter((d) => d.libraries.has(id)));
      await remove(id);
    };
    const r = await run(platform, deps);
    expect(r.status("no-residue")).toBe("failed");
  });

  it("reports corpus anomalies as an optional step", async () => {
    const platform = new FakePlatform();
    platform.auditAnomalies = 2;
    const r = await run(platform);
    const audit = r.steps.find((s) => s.id === "corpus-audit");
    expect(audit?.status).toBe("failed");
    expect(audit?.optional).toBe(true);
  });

  it("writes a PDF with a valid cross-reference", () => {
    const text = new TextDecoder().decode(pdfBytes(`marker ${MARKER}`));
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    for (const match of text.matchAll(/^(\d{10}) 00000 n /gm)) {
      expect(text.slice(Number(match[1])).match(/^\d+ 0 obj/)).not.toBeNull();
    }
  });
});
