import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadLedger,
  matchRules,
  parseRuleFile,
  resetLedger,
  saveLedger,
} from "../scripts/lib/state.mjs";
import { tmpProject, write } from "./helpers.mjs";

test("parseRuleFile reads a paths list out of frontmatter", () => {
  const { paths, body } = parseRuleFile(
    `---\npaths:\n  - "src/db/**"\n  - '**/*.sql'\npriority: low\n---\n\nUse parameterized queries only.\n`,
  );
  assert.deepEqual(paths, ["src/db/**", "**/*.sql"]);
  assert.equal(body, "Use parameterized queries only.");
});

test("parseRuleFile treats a file without frontmatter as a bodyless-pathless rule", () => {
  const { paths, body } = parseRuleFile("Just some text");
  assert.deepEqual(paths, []);
  assert.equal(body, "Just some text");
});

test("parseRuleFile stops the list at the next top-level key", () => {
  const { paths } = parseRuleFile("---\npaths:\n  - a/**\nname: x\n---\nbody");
  assert.deepEqual(paths, ["a/**"]);
});

test("rules without globs or body are not loaded", () => {
  const proj = tmpProject("rules-load");
  write(`${proj}/.claude/anchor-rules/empty.md`, "no frontmatter here");
  write(
    `${proj}/.claude/anchor-rules/db.md`,
    "---\npaths:\n  - \"src/db/**\"\n---\nDB rule body",
  );
  const loaded = matchRules(proj, `${proj}/src/db/q.ts`);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, "db");
  assert.equal(loaded[0].body, "DB rule body");
});

test("matchRules matches project-relative paths and ignores files outside the project", () => {
  const proj = tmpProject("rules-match");
  write(
    `${proj}/.claude/anchor-rules/ui.md`,
    "---\npaths:\n  - \"src/components/**\"\n---\nUI rule body",
  );
  assert.equal(matchRules(proj, `${proj}/src/components/Card.tsx`).length, 1);
  assert.equal(matchRules(proj, `${proj}/src/db/q.ts`).length, 0);
  assert.equal(matchRules(proj, "/etc/passwd").length, 0);
  assert.equal(matchRules(proj, `${proj}/../outside/x.ts`).length, 0);
});

test("ledger round-trips and reset removes it", () => {
  const proj = tmpProject("ledger");
  const ledger = loadLedger(proj, "s1");
  assert.deepEqual(ledger.injected, {});
  ledger.injected["db"] = 123;
  saveLedger(proj, "s1", ledger);
  assert.equal(loadLedger(proj, "s1").injected["db"], 123);
  resetLedger(proj, "s1");
  assert.deepEqual(loadLedger(proj, "s1").injected, {});
  resetLedger(proj, "s1"); // idempotent
});
