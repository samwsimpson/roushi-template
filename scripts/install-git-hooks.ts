// scripts/install-git-hooks.ts
//
// Installs the project's git hooks into .git/hooks/. Run once per clone:
//
//   pnpm hooks:install
//
// What gets installed:
//   - .git/hooks/pre-commit — invokes scripts/pre-commit-check.ts via tsx
//
// Why this exists: git hooks live in .git/hooks/ which is NOT under version
// control, so a fresh clone won't have them. Husky solves this by adding
// a dep + a .husky/ dir; we sidestep that with a tiny installer script
// (no runtime dep, no extra config).
//
// The hook script invokes tsx so the check itself stays in TypeScript and
// benefits from the rest of the project's strict typecheck.

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const HOOKS_DIR = path.join(ROOT, ".git", "hooks");

const HOOKS: Record<string, string> = {
  "pre-commit": `#!/bin/sh
# Auto-installed by scripts/install-git-hooks.ts — see that file for the source.
exec ./node_modules/.bin/tsx scripts/pre-commit-check.ts
`,
};

function main() {
  if (!fs.existsSync(path.join(ROOT, ".git"))) {
    console.error(
      "✗ This directory isn't a git repository — nothing to install.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  }

  let installed = 0;
  for (const [name, content] of Object.entries(HOOKS)) {
    const target = path.join(HOOKS_DIR, name);
    fs.writeFileSync(target, content, { mode: 0o755 });
    // Re-chmod on POSIX (Windows ignores; git for Windows respects the bit
    // when invoked from git bash anyway)
    if (process.platform !== "win32") {
      fs.chmodSync(target, 0o755);
    }
    console.log(`✓ Installed .git/hooks/${name}`);
    installed++;
  }

  console.log("");
  console.log(`${installed} hook(s) installed.`);
  console.log("");
  console.log(
    "The pre-commit hook will block commits that bump package.json version",
  );
  console.log(
    "without a matching CHANGELOG.md entry or with out-of-sync src/cli +",
  );
  console.log("src/mcp version strings.");
  console.log("");
  console.log("Bypass (use sparingly): git commit --no-verify");
}

main();
