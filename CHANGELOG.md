# Changelog

## 0.2.0 — 2026-09-19

- **PostCompact hook**: persists Claude Code's own `compact_summary` per
  session to `.claude/state-anchor/summary-<session>.json`.
- **Chained-compaction protection**: `PreCompact` folds the previous
  compaction summary into the new snapshot (and clears the summary file);
  `SessionStart` re-injects it as a "previous compaction summary" section.
  After repeated compactions the model keeps the older, less-eroded text
  instead of only a summary-of-a-summary.
- **`/anchor` command**: review and refresh the anchor state mid-session.
- CI workflow (Node 20/22 matrix), README verified-status table,
  architecture docs for the summary chain.

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
