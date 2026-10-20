## ADDED Requirements

### Requirement: Checks are grouped into families

The self-test page SHALL present its checks as families, in this order:
platform, identity, authorization, knowledge, agents, prompts, conversations,
teams, web research, security and observability. Each family SHALL have its own
action and step report. The page SHALL run one family at a time. Every check
SHALL run as the signed-in admin and SHALL ask for no password, except the
existing "test another profile" probe.

#### Scenario: A family is running

- **WHEN** one family is running
- **THEN** every other action on the page is unavailable until it finishes

### Requirement: Run all

The page SHALL offer one action that runs every family in order, excluding the
credential-expiry check, and SHALL offer one combined report covering every
family run so far, with the date and the page origin.

#### Scenario: One family fails

- **WHEN** a family reports a failed step during Run all
- **THEN** the remaining families still run, and the combined report shows the failure

### Requirement: Run-scoped fixtures

Every object a family creates SHALL carry the run token in its name. Teardown
SHALL delete only the identifiers the run created, SHALL run however the
family ends, and SHALL verify that what it deleted is gone. A family SHALL NOT
write shared platform settings: platform prompt, model bindings, UI settings,
announcements or theme.

#### Scenario: A step fails mid-family

- **WHEN** a step fails after fixtures were created
- **THEN** the remaining steps report, and teardown still deletes those fixtures

### Requirement: Platform family

The platform family SHALL check, without writing anything: control-plane and
knowledge-flow health and readiness; that the account-status check answers;
that the token issuer matches the public provider configuration; browser,
token and server clocks; that every agent runtime serves at least one
available template; that the harness agent is available; that the team's chat
model resolves and is usable; and that capabilities, model bindings, knowledge
base definitions, UI settings, announcements and the purge policy can be read.

#### Scenario: A runtime is down

- **WHEN** every template of one runtime is unavailable
- **THEN** the runtime step fails, naming that runtime

### Requirement: Authorization family

Beyond the existing single-account probe, the authorization family SHALL check
that protected routes of every backend refuse a missing, malformed or
re-signed token with 401; that platform-administration routes answer the
admin as its own platform roles say; and that, for teams the admin does not
belong to, team content routes are refused with 403 or 404.

#### Scenario: A protected route answers without a token

- **WHEN** a protected route returns anything but 401 without a token
- **THEN** the step fails, naming the route and the status

### Requirement: Knowledge family

The knowledge family SHALL work in the admin's personal space and SHALL check:
retrieval scoped to one folder and isolation from another through a real agent
turn; direct search under each search policy; ingestion and retrieval of one
small document per text, Markdown, CSV, HTML and PDF format; a SQL query on the
CSV; that linking a document into a second folder makes it retrievable there
and unlinking removes it; that a non-retrievable document is not returned; the
folder's document tree; that deleting a folder leaves no retrievable chunk of
its documents; and, as an optional step, the corpus audit.

#### Scenario: A format cannot be extracted

- **WHEN** the deployment cannot ingest one of the formats
- **THEN** that format's step fails and the other formats still run

### Requirement: Agents family

The agents family SHALL check, with the harness agent in the personal space:
system-prompt delivery; that an updated system prompt is delivered on every one
of several following turns; that a disabled instance cannot run and runs again
once enabled; that copy targets include the personal space; that a duplicate
under a chosen name is created and a second one under the same name is
refused; and that concurrent turns in separate sessions each receive only
their own session's context.

#### Scenario: Concurrent turns cross

- **WHEN** a turn's answer contains another session's marker
- **THEN** the step fails, naming both sessions

### Requirement: Prompts and conversations families

The prompts family SHALL check delivery of a context prompt, delivery of its
updated text, prompt categories, favorites, prompt commands, the marketplace
listing, and that a deleted prompt can no longer be read. The conversations
family SHALL check session listing, rename, persistence of a turn, attachment
upload, listing and deletion, and bulk deletion.

#### Scenario: A deleted prompt is still readable

- **WHEN** reading a prompt after its deletion succeeds
- **THEN** the step fails

### Requirement: Teams family

The teams family SHALL be skipped, with the reason, when the admin has not
accepted the team-admin charter, and SHALL NOT accept it. Otherwise it SHALL
create a disposable team administered by the admin and check: the admin's
permissions; granting and revoking the editor role, with a write refused while
revoked; a team prompt, folder and agent; the wiki when enabled; the join link;
the team's model routing; copying the team agent to the personal space; and
that deleting the team leaves none of its prompts, folders or agents
reachable.

#### Scenario: The charter is not accepted

- **WHEN** the admin has no recorded charter acceptance
- **THEN** the family is skipped and no team is created

### Requirement: Security and observability families

The security family SHALL report which response-hardening headers the page
origin sets, as an optional step, and SHALL fail when an uploaded HTML
document is served inline as HTML without a sandboxing policy. The
observability family SHALL check that usage KPI presets can be read, and SHALL
skip the search and metrics backends when the deployment does not provide them.

#### Scenario: Uploaded HTML is served inline

- **WHEN** the streamed content of an uploaded HTML document comes back as `text/html` with no `sandbox` policy
- **THEN** the step fails, because the document would run on the platform origin
