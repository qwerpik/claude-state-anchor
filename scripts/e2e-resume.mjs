#!/usr/bin/env node
// Optional end-to-end verifier: proves that the SessionStart hook injects
// snapshot content into a real Claude Code session.
//
// Flow: start a `claude -p` session in a throwaway project → write a
// snapshot whose anchor contains a secret codephrase (the transcript never
// mentions it) → resume the session and ask for the codephrase. If the model
// answers correctly, the only possible source is the hook's additionalContext.
//
// Usage: node scripts/e2e-resume.mjs
// Requires: `claude` CLI on PATH, authenticated.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODEPHRASE = "MANGO-TANGO-42";
const TIMEOUT_MS = 180_000;

function fail(msg) {
  console.error(`e2e FAILED: ${msg}`);
  process.exit(1);
}

function claude(args, cwd) {
  return JSON.parse(
    execFileSync("claude", args, { cwd, encoding: "utf8", timeout: TIMEOUT_MS }),
  );
}

// 1. throwaway project
const proj = path.join(REPO, "tests", ".tmp", "e2e");
fs.rmSync(proj, { recursive: true, force: true });
fs.mkdirSync(proj, { recursive: true });

// 2. hook wiring via a settings file passed with --settings (avoids touching
//    the user's global config and the project-trust prompt for .claude/)
const settings = {
  hooks: {
    SessionStart: [
      {
        matcher: "compact|resume",
        hooks: [
          {
            type: "command",
            command: `node "${path.join(REPO, "scripts", "session-start.mjs")}"`,
            timeout: 10,
          },
        ],
      },
    ],
  },
};
const settingsFile = path.join(proj, "state-anchor-settings.json");
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

// 3. first session
console.error("[1/3] starting initial claude session…");
const first = claude(
  ["-p", "--output-format", "json", "--settings", settingsFile, "Reply with exactly: OK"],
  proj,
);
const sessionId = first.session_id;
if (!sessionId) fail(`no session_id in first-session output: ${JSON.stringify(first).slice(0, 300)}`);

// 4. seed a snapshot for that session — the codephrase exists nowhere else
const stateDir = path.join(proj, ".claude", "state-anchor");
fs.mkdirSync(stateDir, { recursive: true });
const snapshot = {
  schema: 1,
  session_id: sessionId,
  saved_at: new Date().toISOString(),
  trigger: "auto",
  anchor: `State Anchor e2e test. Remember this codephrase: ${CODEPHRASE}.`,
  files_touched: [],
  last_activity: "",
  recent_activity: [],
  transcript_parsed: false,
};
fs.writeFileSync(
  path.join(stateDir, `snapshot-${sessionId}.json`),
  JSON.stringify(snapshot, null, 2),
);

// 5. resume — SessionStart(resume) must inject the snapshot
console.error("[2/3] resuming session with seeded snapshot…");
const second = claude(
  [
    "-p",
    "--resume",
    sessionId,
    "--output-format",
    "json",
    "--settings",
    settingsFile,
    "A block of restored context was injected into your context at session start. What codephrase does it contain? Reply with ONLY the codephrase.",
  ],
  proj,
);

// 6. verdict
console.error("[3/3] checking answer…");
const answer = String(second.result ?? "");
const ok = answer.includes(CODEPHRASE);
console.log(`model replied: ${answer.slice(0, 200)}`);
console.log(ok ? "e2e PASSED — snapshot content reached the model via SessionStart injection" : "e2e FAILED — codephrase not found in the reply");

fs.rmSync(proj, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
