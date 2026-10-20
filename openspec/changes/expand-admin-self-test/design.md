## Context

See [proposal.md](proposal.md). Verified constraints:

- The page runs in the admin's browser, as one identity. Checks needing a
  second account stay in `validation/`, except the existing Keycloak-only
  "test another profile" probe.
- A platform admin has no relation on any team. Team checks therefore need a
  team the admin creates and administers. Creation writes `pending_team_admin`
  until the creator accepted the team-admin charter, so the family is skipped
  without an accepted charter.
- The deterministic `fred.github.self_test` agent echoes retrieved chunks, its
  system prompt and the session's context prompt without an LLM. Turn-based
  checks assert on that echo.
- Calls made as the admin go through the generated RTK Query client,
  dispatched with `initiate` as `useTaskPolling` already does. Raw `fetch` is
  used only where the generated client cannot express the check: no token, a
  forged token, or a response header.

## Decisions

- **One scenario and one deps contract per family.** A scenario depends only on
  its narrow deps interface, so each family is unit-tested with fakes. A hook
  binds the real client for that family.
- **Run-scoped fixtures, deleted by id.** Every created object carries the run
  token in its name; teardown deletes only the ids the run created and then
  verifies they are gone.
- **Read-only on shared state.** Checks on the platform prompt, model bindings,
  UI settings and announcements only read them.
- **Missing optional deployment features skip.** A disabled wiki, an absent
  OpenSearch or Prometheus, or an unset proxy header is reported as skipped
  with the reason, not failed.
- **Response safety fails.** Uploaded HTML served inline as `text/html` without
  a sandboxing policy fails, because it runs on the platform origin.

## Non-Goals

- No new backend endpoint or headless runner. Running the families from a
  pipeline is a separate decision.
- No change to the credential-expiry or web-research checks.

## Risks

- A deployment with a large corpus makes the corpus audit slow. The audit step
  is optional and reports anomalies without blocking the rest of the family.
