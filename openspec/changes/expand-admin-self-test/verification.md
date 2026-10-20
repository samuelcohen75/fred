## Proven offline

Run in `apps/frontend` on branch `feat/self-test-families`, 2026-10-20.

| Command                                                                                      | Result                                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `make code-quality`                                                                          | tsc, prettier and eslint clean                            |
| `make test`                                                                                  | 368 files passed, 1 skipped; 4475 tests passed, 7 skipped |
| `npx vitest run src/rework/features/pipeline src/rework/components/pages/admin/SelfTestPage` | 160 tests passed                                          |

Every family scenario is unit-tested with fakes beside it, under
`apps/frontend/src/rework/features/pipeline/scenarios/`: a passing deployment
with full cleanup, and at least one failing deployment per claim. The page test
covers registry order, Run all continuing after a family that throws, the
credential-expiry check staying out of Run all, and the authorization extras
staying inside the authorization family.

The format fixtures were fed to the default `fast` profile's processors from
`apps/knowledge-flow-backend/config/configuration_prod.yaml`, outside the
platform: each of text, Markdown, JSON Lines, PDF, Word, Excel and PowerPoint
extracted its marker, and the CSV rendered its marker row.

## Not proven

- No family was run against a live deployment. The deps bind the generated
  client and type-check, but request shapes, status codes and timings are
  unverified until an admin runs the page on a real stack.
- The SVG preview check is expected to fail on deployments without a
  sandboxing policy on `/knowledge-flow/v1/raw_content/stream/{uid}`; whether
  that is exploitable depends on how previews are rendered, which this change
  does not assess.
- Whether the harness agent is enabled for a newly created team depends on the
  deployment's capability policy; the teams family skips the agent steps when
  it is not.
