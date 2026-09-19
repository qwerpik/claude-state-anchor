import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ledgerFile,
  snapshotFile,
  stateDir,
} from "../scripts/lib/state.mjs";
import { REPO_DIR, tmpProject, write } from "./helpers.mjs";

const SCRIPTS = path.join(REPO_DIR, "scripts");

function run(script, payload, { raw = null } = {}) {
  return execFileSync(process.execPath, [path.join(SCRIPTS, script)], {
    input: raw ?? JSON.stringify(payload),
    encoding: "utf8",
  });
}

function readSnapshot(proj, sessionId) {
  return JSON.parse(fs.readFileSync(snapshotFile(proj, sessionId), "utf8"));
}

const TRANSCRIPT = [
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name: "Edit", input: { file_path: "/proj/src/a.ts" } }],
    },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Done implementing the parser." }],
    },
  }),
].join("\n");

test("precompact writes a snapshot; garbage stdin is a silent no-op", () => {
  const proj = tmpProject("contract-precompact");
  write(`${proj}/.claude/anchor.md`, "Keep queries parameterized.");
  write(`${proj}/transcript.jsonl`, TRANSCRIPT);

  const out = run("precompact.mjs", {
    session_id: "sess-1",
    transcript_path: `${proj}/transcript.jsonl`,
    cwd: proj,
    trigger: "auto",
  });
  assert.equal(out, "");
  const snap = readSnapshot(proj, "sess-1");
  assert.equal(snap.anchor, "Keep queries parameterized.");
  assert.deepEqual(snap.files_touched, ["/proj/src/a.ts"]);
  assert.equal(snap.last_activity, "Done implementing the parser.");

  // malformed stdin must not crash the hook or block compaction
  assert.doesNotThrow(() => run("precompact.mjs", {}, { raw: "not json" }));
});

test("precompact still snapshots from the anchor alone when the transcript is missing", () => {
  const proj = tmpProject("contract-precompact-notx");
  write(`${proj}/.claude/anchor.md`, "anchor only");
  run("precompact.mjs", { session_id: "sess-2", transcript_path: "", cwd: proj });
  assert.equal(readSnapshot(proj, "sess-2").anchor, "anchor only");
});

test("session-start injects the snapshot, archives it, and resets the ledger on compact", () => {
  const proj = tmpProject("contract-session-start");
  write(`${proj}/.claude/anchor.md`, "Never import the db client into views.");
  write(`${proj}/transcript.jsonl`, TRANSCRIPT);
  run("precompact.mjs", {
    session_id: "sess-3",
    transcript_path: `${proj}/transcript.jsonl`,
    cwd: proj,
    trigger: "auto",
  });
  saveLedgerFor(proj, "sess-3");

  const out = run("session-start.mjs", {
    session_id: "sess-3",
    cwd: proj,
    source: "compact",
  });
  const parsed = JSON.parse(out);
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(ctx, /state-anchor/);
  assert.match(ctx, /Never import the db client into views\./);
  assert.match(ctx, /\/proj\/src\/a\.ts/);
  assert.match(ctx, /Done implementing the parser\./);

  // snapshot archived, ledger wiped (compact lost the earlier injections)
  assert.ok(fs.existsSync(snapshotFile(proj, "sess-3") + ".done"));
  assert.ok(!fs.existsSync(snapshotFile(proj, "sess-3")));
  assert.ok(!fs.existsSync(ledgerFile(proj, "sess-3")));

  // second SessionStart: nothing left to inject
  assert.equal(run("session-start.mjs", { session_id: "sess-3", cwd: proj, source: "compact" }), "");
});

function saveLedgerFor(proj, sessionId) {
  write(
    ledgerFile(proj, sessionId),
    JSON.stringify({ injected: { "some-rule": 1 } }),
  );
}

test("session-start keeps the ledger on resume (history is intact)", () => {
  const proj = tmpProject("contract-resume");
  write(`${proj}/.claude/anchor.md`, "anchor");
  run("precompact.mjs", { session_id: "sess-4", transcript_path: "", cwd: proj });
  saveLedgerFor(proj, "sess-4");
  run("session-start.mjs", { session_id: "sess-4", cwd: proj, source: "resume" });
  assert.ok(fs.existsSync(ledgerFile(proj, "sess-4")));
});

test("session-start without any snapshot is silent", () => {
  const proj = tmpProject("contract-empty");
  assert.equal(run("session-start.mjs", { session_id: "sess-5", cwd: proj, source: "compact" }), "");
});

test("pretooluse injects matching rules once per session, then goes quiet", () => {
  const proj = tmpProject("contract-pretooluse");
  write(
    `${proj}/.claude/anchor-rules/db.md`,
    "---\npaths:\n  - \"src/db/**\"\n---\nAll queries must use the query builder — never raw strings.",
  );
  write(
    `${proj}/.claude/anchor-rules/ui.md`,
    "---\npaths:\n  - \"src/ui/**\"\n---\nComponents must not fetch data directly.",
  );

  const payload = {
    session_id: "sess-6",
    cwd: proj,
    tool_name: "Edit",
    tool_input: { file_path: `${proj}/src/db/queries.ts` },
  };

  const first = JSON.parse(run("pretooluse.mjs", payload));
  assert.equal(first.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.match(first.hookSpecificOutput.additionalContext, /state-anchor rule: db/);
  assert.doesNotMatch(first.hookSpecificOutput.additionalContext, /rule: ui/);

  // ledger recorded the injection — second call is silent
  assert.equal(run("pretooluse.mjs", payload), "");
  assert.ok(fs.existsSync(ledgerFile(proj, "sess-6")));

  // non-matching file: silent from the start
  const other = run("pretooluse.mjs", {
    session_id: "sess-7",
    cwd: proj,
    tool_name: "Write",
    tool_input: { file_path: `${proj}/src/main.ts` },
  });
  assert.equal(other, "");

  // no rules dir at all: silent
  const bare = tmpProject("contract-pretooluse-bare");
  assert.equal(
    run("pretooluse.mjs", {
      session_id: "sess-8",
      cwd: bare,
      tool_name: "Edit",
      tool_input: { file_path: `${bare}/src/db/queries.ts` },
    }),
    "",
  );
});

test("state dir is created on demand and stays out of the way", () => {
  const proj = tmpProject("contract-statedir");
  run("precompact.mjs", { session_id: "sess-9", transcript_path: "", cwd: proj });
  assert.ok(fs.existsSync(stateDir(proj)));
});
