// Vercel Analytics pattern.
//
// Adds the @vercel/analytics package + <Analytics /> component to the root
// layout. Zero-config — works as soon as the project is deployed to Vercel.

import type { Pattern } from "./_types.js";

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

    // Step 1: install the package
    if (!(await project.hasDependency(PACKAGE))) {
      project.installPackage(PACKAGE);
      filesToStage.push("package.json", "pnpm-lock.yaml");
    }

    // Step 2: add the component to the root layout
    const candidates = ["src/app/layout.tsx", "app/layout.tsx"];
    let layoutPath: string | null = null;
    for (const c of candidates) {
      if (await project.fileExists(c)) {
        layoutPath = c;
        break;
      }
    }

    if (!layoutPath) {
      throw new Error(
        "Could not find root layout (looked at src/app/layout.tsx and app/layout.tsx).",
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
        // Insert after the last import statement
        const importRegex = /^import .+;\s*$/gm;
        let lastImportEnd = 0;
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(updated)) !== null) {
          lastImportEnd = match.index + match[0].length;
        }
        updated =
          updated.slice(0, lastImportEnd) +
          `\n${IMPORT_LINE}` +
          updated.slice(lastImportEnd);
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
