// Shared state helpers for the State Anchor hooks.
// Zero npm dependencies — Node built-ins only. Every function is defensive:
// hooks must never crash a Claude Code session, so failures degrade to
// "no snapshot / no injection", not exceptions.

import fs from "node:fs";
import path from "node:path";

export const LIMITS = {
  anchorChars: 3000, // .claude/anchor.md content kept in the snapshot
  fileEntries: 25, // touched files remembered
  filePathChars: 200,
  activityChars: 400, // "where you left off" excerpt
  recentMessages: 3, // last assistant texts stored in the snapshot
  recentChars: 300,
  ruleChars: 2000, // total budget for one PreToolUse injection
  transcriptLines: 5000, // transcript lines parsed at most (from the end)
  transcriptBytes: 32 * 1024 * 1024, // read only the tail above this
  snapshotMaxAgeMs: 24 * 60 * 60 * 1000, // orphan snapshots older than this are ignored
  pruneAgeMs: 7 * 24 * 60 * 60 * 1000, // state files older than this are deleted
};

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// ---------- generic io ----------

export function clip(text, max) {
  if (typeof text !== "string") return "";
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

export function readTextFile(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  try {
    for await (const chunk of process.stdin) chunks.push(chunk);
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

export function safeSessionId(sessionId) {
  const s = String(sessionId ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  return s.slice(0, 80) || "unknown";
}

// ---------- paths ----------

export function stateDir(cwd) {
  return path.join(cwd, ".claude", "state-anchor");
}
export function anchorPath(cwd) {
  return path.join(cwd, ".claude", "anchor.md");
}
export function rulesDir(cwd) {
  return path.join(cwd, ".claude", "anchor-rules");
}
export function snapshotFile(cwd, sessionId) {
  return path.join(stateDir(cwd), `snapshot-${sessionId}.json`);
}
export function ledgerFile(cwd, sessionId) {
  return path.join(stateDir(cwd), `ledger-${sessionId}.json`);
}

// ---------- transcript ----------

function readMaybeTail(p, maxBytes) {
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  if (st.size <= maxBytes) return readTextFile(p);
  let fd;
  try {
    fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(maxBytes);
    const bytes = fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
    return buf.toString("utf8", 0, bytes);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// The transcript JSONL schema is undocumented and may change between Claude
// Code versions — parse defensively, keep only what is clearly recognizable.
export function parseTranscript(transcriptPath, limits = LIMITS) {
  const result = { files: [], texts: [], lines: 0, parsed: false };
  if (typeof transcriptPath !== "string" || !transcriptPath) return result;
  const raw = readMaybeTail(transcriptPath, limits.transcriptBytes);
  if (raw == null) return result;
  let lines = raw.split("\n");
  if (lines.length > limits.transcriptLines) lines = lines.slice(-limits.transcriptLines);
  const files = new Map();
  const texts = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    result.lines++;
    const content = obj?.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          texts.push(block.text);
        } else if (block.type === "tool_use" && EDIT_TOOLS.has(block.name)) {
          const fp = block.input?.file_path ?? block.input?.notebook_path;
          if (typeof fp === "string" && fp) files.set(fp, texts.length);
        }
      }
    } else if (typeof content === "string" && content.trim() && obj?.message?.role === "assistant") {
      texts.push(content);
    }
  }
  result.files = [...files.keys()];
  result.texts = texts;
  result.parsed = true;
  return result;
}

// ---------- snapshot handling ----------

export function buildSnapshot(input, transcriptPath, cwd, limits = LIMITS) {
  const t = parseTranscript(transcriptPath, limits);
  return {
    schema: 1,
    session_id: safeSessionId(input.session_id),
    saved_at: new Date().toISOString(),
    trigger: typeof input.trigger === "string" ? input.trigger : null,
    anchor: clip(readTextFile(anchorPath(cwd)), limits.anchorChars),
    files_touched: t.files
      .slice(-limits.fileEntries)
      .map((f) => clip(f, limits.filePathChars)),
    last_activity: t.texts.length ? clip(t.texts[t.texts.length - 1], limits.activityChars) : "",
    recent_activity: t.texts.slice(-limits.recentMessages).map((s) => clip(s, limits.recentChars)),
    transcript_parsed: t.parsed,
  };
}

export function writeSnapshot(cwd, snapshot) {
  if (!ensureDir(stateDir(cwd))) return false;
  try {
    fs.writeFileSync(
      snapshotFile(cwd, snapshot.session_id),
      JSON.stringify(snapshot, null, 2),
    );
    return true;
  } catch {
    return false;
  }
}

// Exact session match first, then the newest orphan snapshot (covers
// compaction flows where the session id changes underneath us).
export function findSnapshot(cwd, sessionId, limits = LIMITS) {
  const dir = stateDir(cwd);
  const exact = snapshotFile(cwd, sessionId);
  try {
    if (fs.statSync(exact).isFile()) return exact;
  } catch {
    // fall through to orphan search
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const cutoff = Date.now() - limits.snapshotMaxAgeMs;
  let best = null;
  let bestM = 0;
  for (const e of entries) {
    if (!/^snapshot-.+\.json$/.test(e)) continue;
    const p = path.join(dir, e);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs > bestM && st.mtimeMs > cutoff) {
        bestM = st.mtimeMs;
        best = p;
      }
    } catch {
      // ignore
    }
  }
  return best;
}

export function markSnapshotDone(snapshotFile_) {
  try {
    fs.renameSync(snapshotFile_, snapshotFile_ + ".done");
  } catch {
    // if rename fails, leave the file — worst case is a duplicate injection
  }
}

export function pruneStateDir(cwd, limits = LIMITS) {
  const dir = stateDir(cwd);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - limits.pruneAgeMs;
  for (const e of entries) {
    if (!e.startsWith("snapshot-") && !e.startsWith("ledger-")) continue;
    const p = path.join(dir, e);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

// ---------- injection composition ----------

export function composeRestoreContext(snap) {
  if (!snap || typeof snap !== "object") return "";
  const parts = [];
  if (snap.anchor) parts.push(`### Project anchor notes (pre-compaction)\n${snap.anchor}`);
  if (Array.isArray(snap.files_touched) && snap.files_touched.length) {
    parts.push(`### Files touched this session\n${snap.files_touched.map((f) => `- ${f}`).join("\n")}`);
  }
  if (snap.last_activity) parts.push(`### Where you left off\n${snap.last_activity}`);
  if (!parts.length) return "";
  return (
    "<state-anchor>\n" +
    "The conversation was compacted. The notes below were recorded before compaction and remain authoritative — do not re-derive or re-litigate them.\n\n" +
    parts.join("\n\n") +
    "\n</state-anchor>"
  );
}

// ---------- rules ----------

// Minimal glob: ** (any depth, including none), * (within a segment),
// ? (one char). Everything else is literal.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

// Frontmatter subset: a `paths:` key followed by `- "glob"` lines.
// Anything else in the frontmatter is ignored.
export function parseRuleFile(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!m) return { paths: [], body: raw.trim() };
  const body = raw.slice(m[0].length).trim();
  const paths = [];
  let inPaths = false;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^paths\s*:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^\s+-\s*/.test(line)) {
      paths.push(line.replace(/^\s+-\s*/, "").trim().replace(/^["']|["']$/g, ""));
    } else if (line.trim() && !/^\s/.test(line)) {
      inPaths = false; // next top-level key
    }
  }
  return { paths, body };
}

export function loadRules(cwd) {
  const dir = rulesDir(cwd);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const rules = [];
  for (const e of entries.sort()) {
    if (!e.endsWith(".md")) continue;
    const raw = readTextFile(path.join(dir, e));
    if (raw == null) continue;
    const { paths, body } = parseRuleFile(raw);
    if (!body || !paths.length) continue;
    rules.push({ name: e.replace(/\.md$/, ""), paths, body });
  }
  return rules;
}

export function matchRules(cwd, filePath, loaded) {
  const rules = loaded ?? loadRules(cwd);
  if (!rules.length) return [];
  let rel = path.relative(cwd, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return [];
  rel = rel.split(path.sep).join("/");
  const hits = [];
  for (const rule of rules) {
    if (rule.paths.some((g) => globToRegExp(g).test(rel))) hits.push(rule);
  }
  return hits;
}

// ---------- per-session rule ledger ----------

export function loadLedger(cwd, sessionId) {
  const data = readJsonFile(ledgerFile(cwd, sessionId));
  return data && typeof data === "object" && data.injected && typeof data.injected === "object"
    ? data
    : { injected: {} };
}

export function saveLedger(cwd, sessionId, ledger) {
  if (!ensureDir(stateDir(cwd))) return;
  try {
    fs.writeFileSync(ledgerFile(cwd, sessionId), JSON.stringify(ledger, null, 2));
  } catch {
    // losing a ledger entry only means a rule may be injected twice — harmless
  }
}

export function resetLedger(cwd, sessionId) {
  try {
    fs.unlinkSync(ledgerFile(cwd, sessionId));
  } catch {
    // no ledger — nothing to reset
  }
}
