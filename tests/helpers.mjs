import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = path.resolve(TESTS_DIR, "..");

// Test temp dirs live inside the repo (tests/.tmp) — some sandboxes
// race-delete /tmp, which would flake the suite.
export function tmpProject(name) {
  const dir = path.join(TESTS_DIR, ".tmp", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
