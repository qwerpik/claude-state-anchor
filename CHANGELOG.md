# Changelog

## 0.1.0 — 2026-09-19

Initial release.

- `PreCompact` hook: session-state snapshot (anchor notes, touched files, last
  activity) written to `.claude/state-anchor/` before compaction.
- `SessionStart` hook (`compact`/`resume`): rehydrates the snapshot into the
  context via `additionalContext`; archives it after injection.
- `PreToolUse` hook (`Edit`/`Write`/`NotebookEdit`): injects path-scoped rules
  from `.claude/anchor-rules/*.md` once per session, with a ledger reset on
  compaction.
- `state-anchor` skill: model-side workflow for maintaining
  `.claude/anchor.md`.
- Zero npm dependencies; test suite on the Node built-in test runner.
- Optional end-to-end verifier (`scripts/e2e-resume.mjs`) that proves
  rehydration against a live `claude` CLI session.
