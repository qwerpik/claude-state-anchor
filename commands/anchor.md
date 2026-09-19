---
description: Review and refresh the State Anchor state (.claude/anchor.md and .claude/state-anchor/)
---

Review the current State Anchor state for this project and refresh what is stale.

1. Read `.claude/anchor.md` (if it exists) and list the files in `.claude/state-anchor/` (snapshots, summaries, ledgers), reading the newest snapshot.
2. Report briefly: when the last snapshot/summary was written, which decisions and constraints are recorded in the anchor, and what the anchor is missing from the current session (decisions made but not yet written down).
3. Update `.claude/anchor.md` in place: add the missing decisions, constraints, in-progress items and gotchas; delete completed ones. Keep the whole file under ~60 lines, one line per item.
4. Record only what actually happened in this session or is visible in the repository — never invent content.
