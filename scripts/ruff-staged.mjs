// Runs ruff (lint --fix + format) against the staged backend files lint-staged passes in.
// Resolves the project's backend/venv first so hook results match local dev/CI ruff versions,
// falling back to a PATH-installed ruff if the venv hasn't been created yet.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

const venvRuff =
  process.platform === "win32"
    ? join("backend", "venv", "Scripts", "ruff.exe")
    : join("backend", "venv", "bin", "ruff");

const ruff = existsSync(venvRuff) ? venvRuff : "ruff";

for (const args of [["check", "--fix", ...files], ["format", ...files]]) {
  const result = spawnSync(ruff, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
