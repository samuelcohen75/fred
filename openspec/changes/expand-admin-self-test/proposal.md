## Why

The admin self-test page proves a handful of journeys: retrieval scoped to two
folders, prompt delivery, web research, JWT handling, a single-account
authorization probe and the credential-expiry check. Most of the platform is
never exercised on a live deployment: health of each service, model and runtime
readiness, document formats, revocation, agent copy, team lifecycle, wiki,
conversations, observability and response safety. A broken deployment is found
by a user instead of by the admin.

The page also grew one section at a time. Its first section mixes retrieval,
agent tuning and prompt delivery in one scenario, and every new check would
add another hand-wired section.

## What Changes

- Regroup the page into **families**, one scenario each, rendered from one
  registry with the same report panel: platform, identity, authorization,
  knowledge, agents, prompts, conversations, teams, web research, security and
  observability.
- Split the existing functional scenario into the knowledge, agents and prompts
  families, and delete it.
- Add checks to every family. All of them run as the signed-in admin, on the
  real deployment, with run-scoped fixtures removed at the end.
- Add **Run all**, which runs every family in order except the long
  credential-expiry check, and one combined report to copy.
- The teams family works in a disposable team the admin creates for the run and
  deletes at the end. It is skipped when the admin has not accepted the
  team-admin charter; the run never accepts it on the admin's behalf.

## Capabilities

### Modified Capabilities

- `admin-self-test`: page organization, run-all, and the checks of each family.

## Impact

Frontend only: `apps/frontend/src/rework/features/pipeline/` and the self-test
page. No backend, API or configuration change. Shared platform settings
(platform prompt, model bindings, announcements, theme) are only read, never
written. The multi-account authorization matrix stays in `validation/`.
