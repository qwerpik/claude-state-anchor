# Architecture

## The problem

Claude Code compacts long conversations (auto-compact, or manual `/compact`).
The compaction summary preserves the narrative but reliably loses: settled
architectural decisions, negative rules, agreed conventions, and the exact
point where work stopped. Agents then duplicate helpers, violate constraints
they agreed to, and drift off-plan.

## The design

A hybrid: the model maintains the *high-value* state in a markdown file it is
best positioned to write; deterministic hooks guarantee that state survives
compaction and that scoped rules reach the model exactly when relevant.

```
                 ┌─────────────────────────────────────────────┐
                 │  .claude/anchor.md      (model-maintained)  │
                 │  .claude/anchor-rules/*.md  (path-scoped)   │
                 └───────────────┬─────────────────────────────┘
                                 │ read
     ┌───────────────┐           ▼
     │   Claude Code │    ┌──────────────┐  snapshot JSON
     │   session     │───▶│ precompact   │──▶ .claude/state-anchor/
     │   (compact    │    │  .mjs        │    snapshot-<session>.json
     │    trigger)   │    └──────────────┘
     │               │    ┌──────────────┐  additionalContext
     │   SessionStart│───▶│ session-start│──▶ <state-anchor> block
     │   compact|res.│    │  .mjs        │    (injected into context)
     │               │    └──────────────┘
     │   PreToolUse  │    ┌──────────────┐  additionalContext
     │   Edit|Write  │───▶│ pretooluse   │──▶ matched rules, once
     └───────────────┘    │  .mjs        │    per session (ledger)
                          └──────────────┘
```

## Hook contracts (per Claude Code docs)

| Hook | Input (stdin JSON) | Output |
|---|---|---|
| `PreCompact` | `session_id`, `transcript_path`, `cwd`, `trigger` (`manual\|auto`) | none — writes snapshot to disk (PreCompact cannot inject text) |
| `SessionStart` | `session_id`, `cwd`, `source` (`compact\|resume`, among others) | `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` |
| `PreToolUse` | `session_id`, `cwd`, `tool_name`, `tool_input` (`file_path` for Edit/Write) | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"…"}}` or nothing |

All three scripts exit 0 on every internal failure — a broken hook must never
block a session, a compaction, or a tool call.

## State files (project-local, under `.claude/state-anchor/`)

| File | Written by | Purpose |
|---|---|---|
| `snapshot-<session>.json` | `precompact.mjs` | pre-compaction state (schema below) |
| `snapshot-<session>.json.done` | `session-start.mjs` | archived after successful rehydration (prevents double injection) |
| `ledger-<session>.json` | `pretooluse.mjs` | which rules were already injected this session |

Maintenance: `session-start.mjs` prunes state files older than 7 days. After
a compaction the rule ledger is **reset** (the model lost the injected rule
text, so rules must be eligible again); on `resume` the ledger is kept (the
full history, including earlier injections, is still present).

## Snapshot schema (v1)

```json
{
  "schema": 1,
  "session_id": "…",
  "saved_at": "2026-09-19T12:00:00.000Z",
  "trigger": "auto",
  "anchor": "contents of .claude/anchor.md (clipped)",
  "files_touched": ["src/a.ts", "…"],
  "last_activity": "last assistant text excerpt",
  "recent_activity": ["…", "…"],
  "transcript_parsed": true
}
```

## Sizing

Injection budgets (constants in `scripts/lib/state.mjs`): anchor 3000 chars,
25 touched files, 400-char activity excerpt, 2000-char total budget per
PreToolUse injection. The restore block lands well under 1k tokens in the
common case — noise versus the tens of thousands of tokens compaction frees.

## Known limitations

- The transcript JSONL schema is undocumented and may change between Claude
  Code versions. The parser is defensive: unrecognized shapes degrade to an
  anchor-only snapshot rather than failing.
- Rule globs support `**`, `*`, `?` and literals only.
- `node` (≥18) must be on `PATH` — hooks run as plain `node` commands.
- Rules only match paths inside the project directory.
