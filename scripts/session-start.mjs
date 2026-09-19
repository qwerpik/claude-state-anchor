#!/usr/bin/env node
// SessionStart hook (compaction / resume): read the snapshot the PreCompact
// hook wrote and inject it back into the context via additionalContext.

import {
  LIMITS,
  composeRestoreContext,
  findSnapshot,
  markSnapshotDone,
  pruneStateDir,
  readJsonFile,
  readStdinJson,
  resetLedger,
  safeSessionId,
} from "./lib/state.mjs";

const input = await readStdinJson();
if (!input) process.exit(0);

try {
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const sessionId = safeSessionId(input.session_id);
  const source = typeof input.source === "string" ? input.source : "";

  // After compaction the model lost any rules injected earlier in the
  // session, so they must be eligible for injection again. On resume the
  // full history (including injected rules) is still there — keep the ledger.
  if (source === "compact") resetLedger(cwd, sessionId);

  const file = findSnapshot(cwd, sessionId);
  if (!file) {
    pruneStateDir(cwd, LIMITS);
    process.exit(0);
  }

  const snap = readJsonFile(file);
  const context = composeRestoreContext(snap);
  if (context) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: context,
        },
      }),
    );
  }
  markSnapshotDone(file);
  pruneStateDir(cwd, LIMITS);
} catch {
  // never break session start because of a hook failure
}
process.exit(0);
