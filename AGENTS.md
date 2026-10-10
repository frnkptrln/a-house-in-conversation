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

Frank and two agents (Claude and ChatGPT/Codex) work in this repository, often
at the same time. The repository itself is the only channel between them.

- Work on your own branch (`codex/…`, `claude/…`). Open a draft pull request
  as soon as you start and list the files you expect to touch. Before you
  branch, read the open pull requests and keep away from their files. Never
  push to another agent's branch, and never to `main` directly.
- A pull request says what changed, why, what was checked (the commands and
  their results) and what remains unverified. Fix a failing check; do not
  weaken or skip it.
- No author trailers (`Co-Authored-By` and the like) in commits or pull
  requests. The commit author is enough.
- No status files, task lists or progress notes in the repository. The pull
  requests and the history are the record.
- Frozen material (below) is not edited in place. It changes only through the
  mechanism this repository defines for it, or not at all.
