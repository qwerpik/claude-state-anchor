import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, clip, parseTranscript } from "../scripts/lib/state.mjs";
import { tmpProject, write } from "./helpers.mjs";

const TRANSCRIPT = [
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "add a cleanup endpoint" },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Decision: reuse the existing /api/jobs route instead of adding a new one." }],
    },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", name: "Edit", input: { file_path: "/proj/src/server/routes.ts" } },
      ],
    },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", name: "Write", input: { file_path: "/proj/src/server/cleanup.ts" } },
      ],
    },
  }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Cleanup endpoint added; tests pending." }],
    },
  }),
  "this line is not json",
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", name: "NotebookEdit", input: { notebook_path: "/proj/analysis.ipynb" } }] },
  }),
].join("\n");

test("parseTranscript extracts touched files and assistant texts, skipping garbage", () => {
  const proj = tmpProject("transcript");
  const p = `${proj}/transcript.jsonl`;
  write(p, TRANSCRIPT);
  const t = parseTranscript(p);
  assert.equal(t.parsed, true);
  assert.deepEqual(t.files, ["/proj/src/server/routes.ts", "/proj/src/server/cleanup.ts", "/proj/analysis.ipynb"]);
  assert.equal(t.texts.length, 2);
  assert.equal(t.texts[1], "Cleanup endpoint added; tests pending.");
});

test("parseTranscript survives missing files and oversized transcripts", () => {
  assert.deepEqual(parseTranscript("/nonexistent/x.jsonl"), { files: [], texts: [], lines: 0, parsed: false });
  assert.deepEqual(parseTranscript(""), { files: [], texts: [], lines: 0, parsed: false });
});

test("buildSnapshot combines anchor, files and last activity", () => {
  const proj = tmpProject("snapshot");
  write(`${proj}/.claude/anchor.md`, "## Decisions\n- reuse /api/jobs");
  write(`${proj}/transcript.jsonl`, TRANSCRIPT);
  const snap = buildSnapshot({ session_id: "abc-123", trigger: "auto" }, `${proj}/transcript.jsonl`, proj);
  assert.equal(snap.session_id, "abc-123");
  assert.equal(snap.trigger, "auto");
  assert.match(snap.anchor, /reuse \/api\/jobs/);
  assert.ok(snap.files_touched.includes("/proj/src/server/routes.ts"));
  assert.equal(snap.last_activity, "Cleanup endpoint added; tests pending.");
  assert.equal(snap.recent_activity.length, 2);
});

test("buildSnapshot works without a transcript (anchor-only)", () => {
  const proj = tmpProject("snapshot-anchor-only");
  write(`${proj}/.claude/anchor.md`, "Just the anchor.");
  const snap = buildSnapshot({ session_id: "x" }, "", proj);
  assert.equal(snap.anchor, "Just the anchor.");
  assert.deepEqual(snap.files_touched, []);
  assert.equal(snap.last_activity, "");
});

test("clip truncates with an ellipsis and trims", () => {
  assert.equal(clip("  hi  ", 10), "hi");
  assert.equal(clip("x".repeat(50), 10).length, 10);
  assert.equal(clip(null, 10), "");
});
