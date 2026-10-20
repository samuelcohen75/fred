---
schema: 1
title: "Regroup the admin self-test into families and add checks across the platform"
impact: none
configuration: none
configuration_reason: "Frontend-only change to the admin self-test page; no configuration key, default, chart value or backend API changes."
no_action_reason: "The page calls existing APIs as the signed-in admin and stores nothing new; existing data, roles and deployments are unchanged."
---
## Applicability

Existing Fred deployments upgrading to this release. Only platform
administrators see the self-test page.

## Prerequisites

No additional prerequisites beyond the normal deployment procedure.

## Configuration

No configuration changes are required.

## Upgrade

Deploy Fred normally; no additional operator or user action is required.

The self-test page now groups its checks into families with a **Run all**
action and one combined report. A run creates temporary folders, documents,
prompts, conversations and agents in the admin's personal space, and the teams
family creates one disposable team. Every one of them carries the run's token
in its name and is deleted at the end of the run.

## Validation

As a platform admin, open Administration, then Self-test, and select Run all.
Each family reports its steps, and the copied full report lists every family
that ran.

## Rollback

Use the normal rollback procedure; this change introduces no data migration.

## Limitations

- The teams family is skipped until the admin accepts the team-admin charter;
  the self-test never accepts it on the admin's behalf.
- A run interrupted by closing the tab leaves its run-scoped fixtures behind,
  named with the run token, to delete by hand.
- The security family may fail on deployments that serve uploaded SVG
  previews inline without a sandbox policy. That result reports existing
  behaviour, not a regression introduced by this release.
