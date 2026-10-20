Frontend paths are under `apps/frontend/src/rework/`.

## 1. Families

- [x] 1.1 Generic run hook that returns a promise, family registry, one generic section, Run all and the combined report.
- [x] 1.2 Split `selfTestScenario` into the knowledge, agents and prompts families and delete it.

## 2. Checks

- [x] 2.1 Platform: service health, account status, issuer, clocks, runtimes, harness agent, models, capability and settings reads.
- [x] 2.2 Authorization: unauthenticated sweep, admin-route sweep and foreign-team sweep.
- [x] 2.3 Knowledge: search policies, document formats, tabular query, library link and unlink, retrievability, document tree, deletion without residue, corpus audit.
- [x] 2.4 Agents: tuning update, disable and enable, copy targets, duplicate and name conflict, concurrent turns.
- [x] 2.5 Prompts: prompt update, categories, favorites, commands, marketplace, deletion.
- [x] 2.6 Conversations: listing, rename, persistence, attachments, bulk deletion.
- [x] 2.7 Teams: charter gate, creation, roles, team resources, wiki, join link, routing, copy to the personal space, role revocation, deletion without residue.
- [x] 2.8 Security and observability: response headers, uploaded HTML served safely, KPI presets, search and metrics backends.

## 3. Close-out

- [x] 3.1 Unit tests per family with fake deps; `make code-quality` and `make test` in `apps/frontend`.
- [x] 3.2 Migration note, testing guide and verification evidence.
