# Claude State Anchor

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
| Before compaction | `PreCompact` | Snapshots your anchor notes, the files touched this session and the last activity into `.claude/state-anchor/` |
| After compaction / on resume | `SessionStart` | Injects that snapshot back as a compact `<state-anchor>` block — the agent wakes up knowing what was decided and where it stopped |
| Before every edit | `PreToolUse` | Injects only the project rules whose path globs match the file being edited — once per session, not a wall of global instructions |

Fully offline, no telemetry, no npm runtime dependencies — three small Node
scripts plus one skill.

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

## How it works

```
/compact (or auto-compact)
   │
   ▼  PreCompact hook
snapshot written to .claude/state-anchor/snapshot-<session>.json
   │
   ▼  compaction runs
   │
   ▼  SessionStart hook (matcher: compact|resume)
<state-anchor> block injected into context, snapshot archived
   │
   ▼  session continues with decisions, prohibitions and context intact
```

The transcript JSONL schema is undocumented, so the parser is defensive:
anything it does not recognize degrades to an anchor-only snapshot instead of
failing. Every hook exits cleanly on internal errors — State Anchor never
blocks your session, a compaction, or a tool call.

State files are project-local (`.claude/state-anchor/`), pruned after 7 days,
and safe to gitignore.

## Verify

```
npm test          # 23 unit + contract tests (Node built-in test runner)
node scripts/e2e-resume.mjs   # optional: proves rehydration end-to-end
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
`.claude/anchor.md` (clipped to 3000 chars), up to 25 touched files, and a
400-char "where you left off" excerpt — well under 1k tokens.

**Windows?** Should work wherever `node` is on `PATH`; not extensively tested.

## Roadmap

- GIF demo (the two-sessions side-by-side)
- `/anchor` command for manual snapshot inspection
- rulesync-compatible rule export
- optional [contextslice](https://github.com/qwerpik/contextslice) integration
  as a rule/context provider

## License

[MIT](LICENSE)
