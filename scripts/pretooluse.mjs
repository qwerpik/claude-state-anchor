#!/usr/bin/env node
// PreToolUse hook (Edit/Write/NotebookEdit): inject the project rules whose
// `paths:` globs match the file about to be modified. Each rule is injected
// at most once per session (tracked in a ledger); the ledger is reset after
// compaction by session-start.mjs.

import {
  LIMITS,
  loadLedger,
  matchRules,
  readStdinJson,
  safeSessionId,
  saveLedger,
} from "./lib/state.mjs";

const input = await readStdinJson();
if (!input) process.exit(0);

try {
  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== "string" || !filePath) process.exit(0);
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();

  const matched = matchRules(cwd, filePath);
  if (!matched.length) process.exit(0);

  const sessionId = safeSessionId(input.session_id);
  const ledger = loadLedger(cwd, sessionId);
  const fresh = matched.filter((r) => !ledger.injected[r.name]);
  if (!fresh.length) process.exit(0);

  const blocks = [];
  let budget = LIMITS.ruleChars;
  for (const rule of fresh) {
    const block = `[state-anchor rule: ${rule.name}]\n${rule.body}`;
    if (block.length > budget) break;
    budget -= block.length;
    blocks.push(block);
    ledger.injected[rule.name] = Date.now();
  }
  if (!blocks.length) process.exit(0);

  saveLedger(cwd, sessionId, ledger);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: blocks.join("\n\n"),
      },
    }),
  );
} catch {
  // never block a tool call because of a hook failure
}
process.exit(0);
