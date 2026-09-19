#!/usr/bin/env node
// PreCompact hook: snapshot the session state before Claude Code compacts
// the context. PreCompact hooks cannot inject text (per Claude Code docs),
// so this only persists state to disk; session-start.mjs rehydrates it.

import {
  LIMITS,
  buildSnapshot,
  readStdinJson,
  removeSummaryFile,
  safeSessionId,
  stateDir,
  writeSnapshot,
} from "./lib/state.mjs";

const input = await readStdinJson();
if (!input || input.session_id == null) process.exit(0);

try {
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const sessionId = safeSessionId(input.session_id);
  const snapshot = buildSnapshot(input, input.transcript_path, cwd, LIMITS);
  snapshot.session_id = sessionId;
  if (writeSnapshot(cwd, snapshot)) {
    // the previous summary now lives inside the snapshot — drop the file
    removeSummaryFile(cwd, sessionId);
  }
  if (process.env.STATE_ANCHOR_DEBUG) {
    console.error(`[state-anchor] snapshot written to ${stateDir(cwd)}`);
  }
} catch {
  // never block compaction because of a hook failure
}
process.exit(0);
