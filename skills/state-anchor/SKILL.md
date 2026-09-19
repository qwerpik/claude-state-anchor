---
name: state-anchor
description: Maintain .claude/anchor.md, the durable project-state file that survives Claude Code context compaction. Use when starting substantive work in a project with State Anchor, when a significant architectural decision, constraint, prohibition or convention is established mid-session, and when continuing work after a compaction or resume.
---

# State Anchor — keeping session state alive across compaction

Context compaction summarizes the conversation but drops load-bearing details:
architectural decisions, negative rules ("never do X"), conventions agreed with
the user, and what was mid-way through. The State Anchor hooks protect the
mechanical part. Your job is the part only the model can write.

## Maintain `.claude/anchor.md`

This file is the high-value state. Keep it current **at the moment a decision
is made** — not "later", not at the end of the session.

Structure (keep the whole file under ~60 lines):

```markdown
# Project anchor

## Decisions
- one line per settled decision (what + why, briefly)

## Constraints & prohibitions
- one line per hard rule ("never import the db client into view components")

## In progress
- what is half-done and what the next step is

## Gotchas
- non-obvious things that will bite: flaky test, weird config, version pin
```

Rules for maintaining it:

- Update the relevant section immediately when a decision is made, a
  prohibition is agreed, or a task changes state.
- One line per item. Completed items get deleted, not crossed out.
- Never let it exceed ~60 lines — it is re-injected verbatim after every
  compaction, so its size is paid on every restore.
- Do not duplicate content that lives in `.claude/anchor-rules/*.md` (those
  are injected automatically before edits).

## After a compaction or resume

You will find a `<state-anchor>` block near the top of your context. Treat it
as authoritative: do not re-derive, re-litigate, or re-ask about what it
records. Continue from "Where you left off".

## What the hooks already do (you do not need to help)

- `PreCompact` — snapshots `.claude/anchor.md`, touched files and the last
  activity into `.claude/state-anchor/`.
- `SessionStart` (`compact`/`resume`) — injects that snapshot back.
- `PreToolUse` (`Edit`/`Write`/`NotebookEdit`) — injects matching rules from
  `.claude/anchor-rules/*.md` before each edit, once per session.
