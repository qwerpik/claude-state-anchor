import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  composeRestoreContext,
  snapshotFile,
  stateDir,
  summaryFile,
} from "../scripts/lib/state.mjs";
import { REPO_DIR, tmpProject, write } from "./helpers.mjs";

const SCRIPTS = path.join(REPO_DIR, "scripts");

function run(script, payload, { raw = null } = {}) {
  return execFileSync(process.execPath, [path.join(SCRIPTS, script)], {
    input: raw ?? JSON.stringify(payload),
    encoding: "utf8",
  });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

test("postcompact persists the official compaction summary per session", () => {
  const proj = tmpProject("summary-postcompact");
  const out = run("postcompact.mjs", {
    session_id: "sess-s1",
    cwd: proj,
    trigger: "auto",
    compact_summary: "  The user decided to use SQLite. Next step: migrations.  ",
  });
  assert.equal(out, "");
  const rec = readJson(summaryFile(proj, "sess-s1"));
  assert.equal(rec.schema, 1);
  assert.match(rec.summary, /^The user decided to use SQLite/);
  assert.equal(rec.trigger, "auto");

  // empty or missing summary: silent no-op, no file
  assert.equal(
    run("postcompact.mjs", { session_id: "sess-s2", cwd: proj, compact_summary: "   " }),
    "",
  );
  assert.ok(!fs.existsSync(summaryFile(proj, "sess-s2")));
  assert.doesNotThrow(() => run("postcompact.mjs", {}, { raw: "not json" }));
});

test("precompact folds the previous summary into the new snapshot and clears the file", () => {
  const proj = tmpProject("summary-fold");
  write(`${proj}/.claude/anchor.md`, "Keep queries parameterized.");
  write(
    summaryFile(proj, "sess-s3"),
    JSON.stringify({ schema: 1, saved_at: "t", trigger: "auto", summary: "Earlier summary text." }),
  );

  run("precompact.mjs", { session_id: "sess-s3", transcript_path: "", cwd: proj });
  const snap = readJson(snapshotFile(proj, "sess-s3"));
  assert.equal(snap.prior_summary, "Earlier summary text.");
  assert.ok(!fs.existsSync(summaryFile(proj, "sess-s3")), "summary file consumed by the fold");
});

test("precompact without a prior summary leaves prior_summary empty", () => {
  const proj = tmpProject("summary-nofold");
  run("precompact.mjs", { session_id: "sess-s4", transcript_path: "", cwd: proj });
  assert.equal(readJson(snapshotFile(proj, "sess-s4")).prior_summary, "");
});

test("session-start injects the carried summary section", () => {
  const proj = tmpProject("summary-inject");
  write(
    snapshotFile(proj, "sess-s5"),
    JSON.stringify({
      schema: 1,
      session_id: "sess-s5",
      anchor: "anchor text",
      prior_summary: "Carried summary from the previous compaction.",
      files_touched: [],
      last_activity: "",
    }),
  );
  const out = run("session-start.mjs", { session_id: "sess-s5", cwd: proj, source: "compact" });
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Previous compaction summary/);
  assert.match(ctx, /Carried summary from the previous compaction\./);
  assert.ok(fs.existsSync(snapshotFile(proj, "sess-s5") + ".done"));
});

test("composeRestoreContext omits the summary section when there is nothing to carry", () => {
  const withAll = composeRestoreContext({
    anchor: "a",
    prior_summary: "s",
    files_touched: ["x.ts"],
    last_activity: "act",
  });
  assert.match(withAll, /Previous compaction summary/);
  const without = composeRestoreContext({ anchor: "a", files_touched: [], last_activity: "" });
  assert.doesNotMatch(without, /Previous compaction summary/);
});

test("pruneStateDir also collects old summary files", () => {
  const proj = tmpProject("summary-prune");
  run("postcompact.mjs", { session_id: "sess-s6", cwd: proj, compact_summary: "old" });
  const file = summaryFile(proj, "sess-s6");
  const ancient = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, ancient, ancient);
  run("session-start.mjs", { session_id: "sess-s7", cwd: proj, source: "startup" });
  assert.ok(!fs.existsSync(file), "summary older than prune age is removed");
  assert.ok(fs.existsSync(stateDir(proj)));
});
