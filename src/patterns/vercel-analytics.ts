// Vercel Analytics pattern.
//
// Adds the @vercel/analytics package + <Analytics /> component to the root
// layout. Zero-config — works as soon as the project is deployed to Vercel.

import type { Pattern } from "./_types";

const PACKAGE = "@vercel/analytics";
const IMPORT_LINE = `import { Analytics } from "@vercel/analytics/react";`;
const COMPONENT = "<Analytics />";

export const pattern: Pattern = {
  slug: "vercel-analytics",
  name: "Vercel Analytics",
  description:
    "Adds @vercel/analytics + the <Analytics /> component to the root layout. Auto-tracks page views on Vercel.",
  category: "analytics",
  parameters: {},

  async detect(project) {
    const hasPackage = await project.hasDependency(PACKAGE);
    const hasComponent = project.grep("<Analytics", { glob: "*.tsx" });

    if (hasPackage && hasComponent) {
      return { status: "applied" };
    }
    if (hasPackage || hasComponent) {
      return {
        status: "partial",
        missing: [
          ...(hasPackage ? [] : ["package"]),
          ...(hasComponent ? [] : ["component"]),
        ],
        detail: `Has ${hasPackage ? "package" : "component"} but missing the other.`,
      };
    }
    return { status: "not-applied" };
  },

  async apply(project) {
    const wasCleanBefore = project.isGitClean();
    const filesToStage: string[] = [];

    // App root is where the package.json + layout live. For monorepos
    // (apps/web, frontend/) this may be a subdir of the repo root.
    const appRoot = await project.findAppRoot();
    const appRootRel = appRoot === project.cwd ? "" : appRoot.slice(project.cwd.length + 1).replace(/\\/g, "/");

    // Step 1: install the package
    if (!(await project.hasDependency(PACKAGE))) {
      project.installPackage(PACKAGE);
      filesToStage.push(
        appRootRel ? `${appRootRel}/package.json` : "package.json",
        appRootRel ? `${appRootRel}/pnpm-lock.yaml` : "pnpm-lock.yaml",
      );
    }

    // Step 2: add the component to the root layout
    const layoutPath = await project.findRootLayout();
    if (!layoutPath) {
      throw new Error(
        "Could not find root layout — checked app/, src/app/, frontend/app/, apps/web/app/, apps/*/app/.",
      );
    }

    const layout = await project.readFile(layoutPath);
    if (!layout) throw new Error(`Failed to read ${layoutPath}`);

    if (layout.includes(IMPORT_LINE) && layout.includes(COMPONENT)) {
      // Already wired up — skip the edit
      console.log(`${layoutPath} already imports + renders <Analytics />`);
    } else {
      // Add import (after the last existing import) + component (before </body>)
      let updated = layout;
      if (!updated.includes(IMPORT_LINE)) {
        // Insert after the last import statement.
        // Matches both `import X from 'y'` (no semicolon) and `import X from 'y';`
        const importRegex = /^import\s.+from\s+['"][^'"]+['"];?\s*$/gm;
        let lastImportEnd = 0;
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(updated)) !== null) {
          lastImportEnd = match.index + match[0].length;
        }
        if (lastImportEnd === 0) {
          // No existing imports found — prepend (rare, mostly for tests)
          updated = `${IMPORT_LINE}\n${updated}`;
        } else {
          updated =
            updated.slice(0, lastImportEnd) +
            `\n${IMPORT_LINE}` +
            updated.slice(lastImportEnd);
        }
      }
      if (!updated.includes(COMPONENT)) {
        updated = updated.replace(/<\/body>/, `  ${COMPONENT}\n      </body>`);
      }

      if (updated === layout) {
        throw new Error(
          "Failed to inject <Analytics /> — couldn't find </body> to anchor.",
        );
      }
      await project.writeFile(layoutPath, updated);
      filesToStage.push(layoutPath);
    }

    if (filesToStage.length === 0) {
      console.log("Vercel Analytics already fully wired up — no changes needed.");
      return;
    }

    const result = project.commitIfClean({
      wasCleanBefore,
      filesToStage,
      message: `feat: add Vercel Analytics\n\nApplied via roushi pattern vercel-analytics.`,
    });

    if (result.warning) {
      console.warn(`⚠ ${result.warning}`);
    }
  },
};
