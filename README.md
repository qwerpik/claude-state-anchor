# Claude State Anchor

[![CI](https://github.com/qwerpik/claude-state-anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/qwerpik/claude-state-anchor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Stop losing your session's brain every time Claude Code compacts the context.**

Long Claude Code sessions get auto-compacted: the conversation is summarized
and the summary reliably drops the load-bearing details — architectural
decisions, negative rules ("never do X"), conventions you agreed on, and the
exact point where work stopped. After compaction the agent duplicates helpers
it already wrote, violates constraints it agreed to, and drifts off-plan.

State Anchor is a zero-dependency Claude Code plugin that makes session state
survive compaction:

| When | Hook | What happens |
|---|---|---|
| Before compaction | `PreCompact` | Snapshots your anchor notes, the files touched this session, the last activity — and the **previous** compaction's summary — into `.claude/state-anchor/` |
| After compaction | `PostCompact` | Persists Claude Code's own compaction summary so the *next* compaction can carry it (no summary-of-a-summary erosion) |
| After compaction / on resume | `SessionStart` | Injects that snapshot back as a compact `<state-anchor>` block — the agent wakes up knowing what was decided and where it stopped |
| Before every edit | `PreToolUse` | Injects only the project rules whose path globs match the file being edited — once per session, not a wall of global instructions |

Fully offline, no telemetry, no npm runtime dependencies — four small Node
scripts, one skill and one command.

## Status

| Path | Status |
|---|---|
| 29 unit & contract tests (`npm test`) | ✅ green |
| Hook execution in a real `claude` CLI session (`SessionStart` on `--resume`, snapshot consumed & archived) | ✅ verified live 2026-09-19 |
| Resume-path rehydration reaching the model (codephrase experiment) | ⚠️ script shipped, run it on your machine — see `scripts/e2e-resume.mjs` |
| Compact path end-to-end (real auto-compact → model uses the `<state-anchor>` block) | ⚠️ pending — tracked in [#1](../../issues/1); the author's environment (local API proxy with a 32k-token limit) cannot run real sessions |

## Install

Requires [Claude Code](https://claude.com/claude-code) and Node.js ≥ 18 on `PATH`.

```
/plugin marketplace add qwerpik/claude-state-anchor
/plugin install state-anchor@claude-state-anchor
```

## Quick start

State Anchor works out of the box, and gets good when you feed it two files:

**1. Let the model maintain `.claude/anchor.md`** (the bundled `state-anchor`
skill teaches it how — one line per decision/constraint, kept current at the
moment a decision is made). This is the state that matters most and only the
model can write it.

**2. Drop path-scoped rules into `.claude/anchor-rules/*.md`:**

```markdown
---
paths:
  - "src/db/**"
  - "**/*.sql"
---

All queries go through the query builder — never concatenate raw SQL strings.
The `db` client must not be imported outside `src/db/`.
```

The first time the agent edits a file matching those globs, the rule is
injected next to the edit; it is not repeated for the rest of the session
(unless compaction happens — then the ledger resets, because the agent just
lost it).

**3. Use `/anchor`** any time to review and refresh the anchor state
mid-session.

## How it works

```
/compact (or auto-compact)
   │
   ▼  PreCompact hook
snapshot written to .claude/state-anchor/snapshot-<session>.json
(includes the PREVIOUS compaction's summary, if any — that file is consumed)
   │
   ▼  compaction runs
   │
   ▼  PostCompact hook
Claude Code's own compact_summary persisted to summary-<session>.json
   │
   ▼  SessionStart hook (matcher: compact|resume)
<state-anchor> block injected into context (anchor + carried summary +
files + last activity), snapshot archived
   │
   ▼  session continues with decisions, prohibitions and context intact
```

Chained compactions are the erosion risk: each pass summarizes the previous
summary. State Anchor breaks the chain — every snapshot carries the oldest
summaries forward, so the injected block degrades far slower than the native
summary-of-a-summary.

The transcript JSONL schema is undocumented, so the parser is defensive:
anything it does not recognize degrades to an anchor-only snapshot instead of
failing. Every hook exits cleanly on internal errors — State Anchor never
blocks your session, a compaction, or a tool call.

State files are project-local (`.claude/state-anchor/`), pruned after 7 days,
and safe to gitignore.

## Verify

```
npm test                        # unit + contract tests (Node built-in runner)
node scripts/e2e-resume.mjs     # optional: proves rehydration end-to-end
```

`e2e-resume.mjs` starts a real `claude` CLI session, seeds a snapshot
containing a secret codephrase, resumes the session, and checks the model can
answer with the codephrase — the only place it could have come from is the
injected context.

## FAQ

**Does this replace CLAUDE.md / rules files?** No — it complements them.
Static instruction files still load at session start; State Anchor makes the
*dynamic* state (decisions made mid-session) and *scoped* rules (per-path)
survive compaction and reach the model at the right moment.

**What gets injected after compaction?** The `<state-anchor>` block: your
`.claude/anchor.md` (clipped to 3000 chars), the previous compaction's
summary (clipped to 2500 chars), up to 25 touched files, and a 400-char
"where you left off" excerpt.

**Windows?** Should work wherever `node` is on `PATH`; not extensively tested.

## Roadmap

- GIF demo (the two-sessions side-by-side)
- rulesync-compatible rule export
- optional [contextslice](https://github.com/qwerpik/contextslice) integration
  as a rule/context provider

## License

[MIT](LICENSE)
