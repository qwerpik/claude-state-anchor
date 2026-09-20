<div align="center">

# ⚓ Claude State Anchor

**Stop losing your session's brain every time Claude Code compacts the context.**

<br />

[![Star this repo](https://img.shields.io/github/stars/qwerpik/claudestateanchor?style=for-the-badge&logo=github&label=%E2%AD%90%20Star%20this%20repo&color=yellow)](https://github.com/qwerpik/claudestateanchor/stargazers)

<br />

[![CI Status](https://img.shields.io/github/actions/workflow/status/qwerpik/claudestateanchor/ci.yml?branch=main&label=CI&style=for-the-badge&logo=githubactions&logoColor=white&color=a6e3a1)](https://github.com/qwerpik/claudestateanchor/actions/workflows/ci.yml)
&nbsp;
[![Release](https://img.shields.io/github/v/release/qwerpik/claudestateanchor?style=for-the-badge&logo=github&color=89b4fa)](https://github.com/qwerpik/claudestateanchor/releases)
&nbsp;
[![Node 18+](https://img.shields.io/badge/Node-18+-89dceb?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
&nbsp;
[![Dependencies: 0](https://img.shields.io/badge/Dependencies-0-a6e3a1?style=for-the-badge)](package.json)
&nbsp;
[![License: MIT](https://img.shields.io/badge/License-MIT-f38ba8?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
&nbsp;
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)

---

Zero-dependency Claude Code plugin • 4 lightweight lifecycle hooks • Fully offline • Never blocks your session.

[Install](#install) • [What It Does](#what-it-does) • [Quickstart](#quick-start) • [How It Works](#how-it-works) • [Architecture](docs/ARCHITECTURE.md) • [Status](#status) • [Contributing](#contributing)

</div>

<br />

> [!TIP]
> **Try in 60 seconds**
> ```bash
> /plugin marketplace add qwerpik/claudestateanchor
> /plugin install state-anchor@claudestateanchor
> ```
> Then let the model maintain `.claude/anchor.md` — one line per decision, kept current the moment it's made.

> [!CAUTION]
> **😱 Without it**
> Compaction summarizes the chat and drops load-bearing details — decisions, "never do X" rules, where work stopped. The agent duplicates helpers, violates constraints, drifts off-plan.

> [!NOTE]
> **⚓ With it**
> Snapshots anchor notes + touched files + last activity **before** compaction, persists the summary **after**, re-injects a compact `<state-anchor>` block on resume. Scoped rules reach the model exactly when relevant.

## Install

<a id="install"></a>

Requires [Claude Code](https://claude.com/claude-code) and Node.js ≥ 18 on `PATH`.

```bash
/plugin marketplace add qwerpik/claudestateanchor
/plugin install state-anchor@claudestateanchor
```

## What it does

<a id="what-it-does"></a>

| When | Hook | What happens |
|---|---|---|
| 📸 Before compaction | `PreCompact` | Snapshots anchor notes, files touched this session, last activity — plus the **previous** compaction's summary — into `.claude/state-anchor/` |
| 💾 After compaction | `PostCompact` | Persists Claude Code's own compaction summary so the *next* compaction can carry it (no summary-of-a-summary erosion) |
| ⚓ After compaction / on resume | `SessionStart` | Injects the snapshot back as a compact `<state-anchor>` block — the agent wakes up knowing what was decided and where it stopped |
| 🎯 Before every edit | `PreToolUse` | Injects only the project rules whose path globs match the file being edited — once per session, not a wall of global instructions |

Fully offline, no telemetry, no npm runtime dependencies — four small Node scripts, one skill, one command.

## Quick start

<a id="quick-start"></a>

State Anchor works out of the box, and gets good when you feed it two files:

**1. Let the model maintain `.claude/anchor.md`**

The bundled `state-anchor` skill teaches it how — one line per decision/constraint, kept current at the moment a decision is made. This is the state that matters most and only the model can write it.

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

The first time the agent edits a file matching those globs, the rule is injected next to the edit; it is not repeated for the rest of the session (unless compaction happens — then the ledger resets, because the agent just lost it).

**3. Use `/anchor` any time** to review and refresh the anchor state mid-session.

## How it works

<a id="how-it-works"></a>

```mermaid
flowchart TD
    C["/compact<br/>(or auto-compact)"] --> PRE["PreCompact hook<br/>write snapshot-session.json<br/>(folds prior summary)"]
    PRE --> CMP["compaction runs"]
    CMP --> POST["PostCompact hook<br/>persist summary-session.json"]
    POST --> START["SessionStart hook (compact / resume)<br/>inject &lt;state-anchor&gt; block"]
    START --> S["session continues<br/>decisions + constraints intact"]
```

<details>
<summary>Text fallback (screen readers / offline)</summary>

```
/compact (or auto-compact)
   │  PreCompact hook
   ▼  snapshot to .claude/state-anchor/snapshot-<session>.json
   │  (includes the PREVIOUS compaction's summary, if any)
   │  compaction runs
   ▼  PostCompact hook
   │  Claude Code's compact_summary persisted to summary-<session>.json
   ▼  SessionStart hook (matcher: compact|resume)
   │  <state-anchor> block injected (anchor + carried summary + files + last activity)
   ▼  session continues with decisions, prohibitions and context intact
```

</details>

**Why it holds up:** chained compactions are the erosion risk — each pass summarizes the previous summary. State Anchor breaks the chain: every snapshot carries the oldest summaries forward, so the injected block degrades far slower than the native summary-of-a-summary.

**Defensive by design:** the transcript JSONL schema is undocumented, so the parser degrades to an anchor-only snapshot instead of failing. Every hook exits cleanly on internal errors — State Anchor never blocks your session, a compaction, or a tool call.

**Local only:** state files are project-local (`.claude/state-anchor/`), pruned after 7 days, and safe to gitignore.

Full hook contracts and file layout: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

<a id="status"></a>

| Path | Status |
|---|---|
| 29 unit & contract tests (`npm test`) | ✅ green |
| Hook execution in a real `claude` CLI session (`SessionStart` on `--resume`, snapshot consumed & archived) | ✅ verified live 2026-09-19 |
| Resume-path rehydration reaching the model (codephrase experiment) | ⚠️ script shipped, run it on your machine — see `scripts/e2e-resume.mjs` |
| Compact path end-to-end (real auto-compact → model uses the `<state-anchor>` block) | ⚠️ pending — tracked in [#1](https://github.com/qwerpik/claudestateanchor/issues/1); the author's environment (local API proxy with a 32k-token limit) cannot run real sessions |

## Verify

<a id="verify"></a>

```bash
npm test                        # unit + contract tests (Node built-in runner)
node scripts/e2e-resume.mjs     # optional: proves rehydration end-to-end
```

`e2e-resume.mjs` starts a real `claude` CLI session, seeds a snapshot containing a secret codephrase, resumes the session, and checks the model can answer with the codephrase — the only place it could have come from is the injected context.

## FAQ

<a id="faq"></a>

**Does this replace CLAUDE.md / rules files?** No — it complements them. Static instruction files still load at session start; State Anchor makes the *dynamic* state (decisions made mid-session) and *scoped* rules (per-path) survive compaction and reach the model at the right moment.

**What gets injected after compaction?** The `<state-anchor>` block: your `.claude/anchor.md` (clipped to 3000 chars), the previous compaction's summary (clipped to 2500 chars), up to 25 touched files, and a 400-char "where you left off" excerpt.

**Windows?** Should work wherever `node` is on `PATH`; not extensively tested.

## Roadmap

<a id="roadmap"></a>

- GIF demo (the two-sessions side-by-side)
- rulesync-compatible rule export
- optional [contextslice](https://github.com/qwerpik/contextslice) integration as a rule/context provider

<a id="contributing"></a>
## 🤝 Contributing

Contributions, bug reports, and optimizations are warmly welcome!

1. Fork the repo and create your branch (`git checkout -b feature/my-feature`).
2. Run `npm test` before submitting.
3. Keep hooks offline, dependency-free, and non-blocking.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for full guidelines.

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=qwerpik/claudestateanchor&type=Date)](https://star-history.com/#qwerpik/claudestateanchor&Date)

---

<div align="center">

Built by [qwerpik](https://github.com/qwerpik)

<br />

**If this plugin protects your Claude sessions, give it a star!**

[![Star this repo](https://img.shields.io/github/stars/qwerpik/claudestateanchor?style=for-the-badge&logo=github&label=%E2%AD%90%20Star%20this%20repo&color=yellow)](https://github.com/qwerpik/claudestateanchor/stargazers)

<br />

Distributed under the [MIT License](LICENSE) © 2026 [qwerpik](https://github.com/qwerpik).

</div>
