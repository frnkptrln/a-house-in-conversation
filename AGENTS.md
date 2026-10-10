# Working in this repository

A GitHub Pages art project: a house that exists in conversation, eight rooms
with their own compositions, sound and ageing. The site is the work.

## Checks

```bash
npm ci && npm test            # memory reader tests
npm run test:browser          # Playwright Chromium: threshold and every room with malformed and blocked storage
```

Open changed rooms at desktop and 390 px width and listen once; no console
errors, no horizontal scroll.

## Rules

- The rooms' compositions, texts, audio files, visual grammar and ageing are
  Frank's work. Robustness, accessibility and mobile fixes are welcome;
  changes to a composition or to what a room says are not made by agents.
- V2 (one permeable document) was withdrawn in September 2026 and is kept as
  history (#16) and as `V2-KONZEPT.md`; do not revive it on `main`.
- Local browser storage is memory, not state: a visit must work when it is
  empty, malformed or blocked. Reading never rewrites stored bytes.

## Working alongside other agents

Frank works with human contributors and AI agents in this repository, often
at the same time. Agents using any model or provider are welcome. The
repository is their shared channel for coordination.

- Work on your own branch (`<agent>/…`, for example `codex/…` or
  `claude/…`). Open a draft pull request as soon as you start and list the
  files you expect to touch. Before you branch, read the open pull requests
  and keep away from their files. Never push to another agent's branch, and
  never to `main` directly.
- A pull request says what changed, why, what was checked (the commands and
  their results) and what remains unverified. Fix a failing check; do not
  weaken or skip it.
- Attribution is optional. Contributors, including AI agents, may identify
  themselves in a pull request or a `Co-authored-by` commit trailer. Credit
  actual contributions and use only names, model details and attribution
  email addresses you know to be accurate. If no attribution email is known,
  use the pull request description. No fixed agent, model or provider name
  is required.
- No status files, task lists or progress notes in the repository. The pull
  requests and the history are the record.
- Frozen material (below) is not edited in place. It changes only through the
  mechanism this repository defines for it, or not at all.
- **Who merges what.** An agent may merge a pull request that changes
  infrastructure, robustness, reproduction, tests or documentation of what
  exists — once CI is green *and* another agent has read the diff against the
  description. A pull request that changes what a work says, does, sounds or
  looks like — texts, scenes, decisions and their costs, pieces, compositions,
  essays, the data a site shows — is marked `needs Frank` (the label, or the
  title prefix `needs Frank:`) and stays open until Frank has read, played or
  listened. No agent merges it, however green it is.
- **Read the diff, not the badge.** Before merging another agent's pull
  request, check that the diff does what the description claims, that nothing
  the description lists as unverified is claimed elsewhere, and that no check
  was weakened. A pull request nobody has read is not reviewed.
