import { test } from "node:test";
import assert from "node:assert/strict";
import { globToRegExp } from "../scripts/lib/state.mjs";

function matches(glob, p) {
  return globToRegExp(glob).test(p);
}

test("segment star stays within one path segment", () => {
  assert.equal(matches("*.md", "README.md"), true);
  assert.equal(matches("*.md", "docs/README.md"), false);
  assert.equal(matches("src/*.ts", "src/a.ts"), true);
  assert.equal(matches("src/*.ts", "src/db/a.ts"), false);
});

test("double star crosses directories, including zero directories", () => {
  assert.equal(matches("**/*.ts", "a.ts"), true);
  assert.equal(matches("**/*.ts", "x/y/z.ts"), true);
  assert.equal(matches("**/*.ts", "a.tsx"), false);
  assert.equal(matches("src/db/**", "src/db/a.ts"), true);
  assert.equal(matches("src/db/**", "src/db/nested/a.ts"), true);
  assert.equal(matches("src/db/**", "src/dbx/a.ts"), false);
});

test("question mark matches exactly one character", () => {
  assert.equal(matches("?.ts", "a.ts"), true);
  assert.equal(matches("?.ts", "ab.ts"), false);
});

test("regex metacharacters in globs are literal", () => {
  assert.equal(matches("a+b.ts", "a+b.ts"), true);
  assert.equal(matches("a+b.ts", "aab.ts"), false);
  assert.equal(matches("v1.0/(*)", "v1.0/x"), false); // no bare star inside parens
  assert.equal(matches("v1.0/*.js", "v1.0/main.js"), true);
});

test("dots are literal", () => {
  assert.equal(matches("app.min.js", "appXmin.js"), false);
});
