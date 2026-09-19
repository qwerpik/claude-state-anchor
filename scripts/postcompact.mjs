#!/usr/bin/env node
// PostCompact hook: Claude Code hands us the official compaction summary.
// Persist it so the NEXT compaction's snapshot can fold it in (see
// buildSnapshot in lib/state.mjs) — state survives chained compactions
// instead of eroding into a summary-of-a-summary. The just-finished
// compaction's summary is already in the model's context, so it is not
// re-injected here.

import {
  LIMITS,
  readStdinJson,
  safeSessionId,
  writeSummaryFile,
} from "./lib/state.mjs";

const input = await readStdinJson();
if (!input || input.session_id == null) process.exit(0);

try {
  const summary = typeof input.compact_summary === "string" ? input.compact_summary.trim() : "";
  if (!summary) process.exit(0);
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const sessionId = safeSessionId(input.session_id);
  writeSummaryFile(cwd, sessionId, summary, input.trigger, LIMITS);
  if (process.env.STATE_ANCHOR_DEBUG) {
    console.error(`[state-anchor] compact summary stored for session ${sessionId}`);
  }
} catch {
  // never break the compaction flow because of a hook failure
}
process.exit(0);
