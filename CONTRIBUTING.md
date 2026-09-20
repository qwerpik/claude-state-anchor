# Contributing to claudestateanchor

Thank you for your interest in improving `claudestateanchor`! Contributions, bug reports, and optimizations are warmly welcome.

## Quick Contribution Workflow (3 Steps)

1. **Fork and Branch**
   - Fork the repository on GitHub.
   - Create a feature branch: `git checkout -b feature/my-enhancement`.

2. **Develop and Test**
   - Make your changes.
   - Run the full test suite locally before committing:
     ```bash
     npm test
     ```
   - All 29+ unit and contract tests must pass.

3. **Open a Pull Request**
   - Push your branch to your fork: `git push origin feature/my-enhancement`.
   - Submit a Pull Request against `main` with a clear description of what changed and why.

## Core Design Constraints

- **Zero Runtime Dependencies**: `claudestateanchor` strictly uses Node.js standard libraries (`node:fs`, `node:path`, `node:child_process`, etc.). Do not introduce third-party npm runtime packages.
- **Fail-Safe & Non-Blocking**: Hooks must always catch internal errors and exit cleanly (`process.exit(0)`) so they never block a user session or break Claude Code.
- **Project-Local State**: State and snapshot files remain project-local (`.claude/state-anchor/`) and are safely pruned.
