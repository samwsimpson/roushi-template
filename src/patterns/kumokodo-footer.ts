// KumoKodo footer attribution pattern.
//
// Per portfolio-kumokodo-footer-attribution rule (2026-05-26):
// Every KumoKodo site links back to the umbrella brand from its footer.
//   - SaaS products  → "A KumoKodo.ai SaaS application."
//   - Client work    → "Built by KumoKodo.ai"
//
// This pattern detects whether the attribution is already present in the
// project's root layout, and if not, prompts to add it.

import type { Pattern } from "./_types.js";

const SAAS_LINE = "A KumoKodo.ai SaaS application";
const CLIENT_LINE = "Built by KumoKodo.ai";

export const pattern: Pattern = {
  slug: "kumokodo-footer",
  name: "KumoKodo footer attribution",
  description:
    "Adds the 'Built by / A KumoKodo.ai SaaS application' line to the project's footer per the portfolio rule.",
  category: "branding",
  parameters: {
    variant: {
      type: "string",
      prompt: "SaaS or client variant? (saas/client)",
      example: "saas",
      required: false,
      default: "saas",
    },
  },

  async detect(project) {
    // Look for either phrase in any tracked source file
    const hasSaas = project.grep(SAAS_LINE);
    const hasClient = project.grep(CLIENT_LINE);

    if (hasSaas || hasClient) {
      return {
        status: "applied",
        detail: hasSaas
          ? "SaaS variant footer present"
          : "Client variant footer present",
        appliedParams: { variant: hasSaas ? "saas" : "client" },
      };
    }

    return {
      status: "not-applied",
      detail:
        "Footer doesn't link back to kumokodo.ai — patterns/portfolio-kumokodo-footer-attribution applies.",
    };
  },

  async apply(project, params) {
    const variant = String(params.variant ?? "saas").toLowerCase();
    if (variant !== "saas" && variant !== "client") {
      throw new Error(
        `variant must be "saas" or "client" — got "${variant}"`,
      );
    }
    const text = variant === "saas" ? SAAS_LINE : CLIENT_LINE;

    const wasCleanBefore = project.isGitClean();

    // Find the root layout. Next.js App Router puts it at src/app/layout.tsx
    // or app/layout.tsx — check both.
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
        "Could not find root layout (looked at src/app/layout.tsx and app/layout.tsx). " +
          "This pattern only supports Next.js App Router projects right now.",
      );
    }

    const layout = await project.readFile(layoutPath);
    if (!layout) throw new Error(`Failed to read ${layoutPath}`);

    // If the layout already has a footer, we don't want to clobber it —
    // just append our line. If it doesn't, drop in a minimal <footer>.
    const hasFooter = /<footer[\s>]/.test(layout);
    const attributionMarkup =
      variant === "saas"
        ? `<p className="text-center text-xs text-zinc-600 py-2"><a href="https://kumokodo.ai" target="_blank" rel="noopener noreferrer">A KumoKodo.ai SaaS application</a>.</p>`
        : `<p className="text-center text-xs text-zinc-600 py-2"><a href="https://kumokodo.ai" target="_blank" rel="noopener noreferrer">Built by KumoKodo.ai</a></p>`;

    let updated: string;
    if (hasFooter) {
      // Insert our line just before </footer>
      updated = layout.replace(
        /<\/footer>/,
        `  ${attributionMarkup}\n      </footer>`,
      );
    } else {
      // Insert a <footer> just before </body>
      updated = layout.replace(
        /<\/body>/,
        `      <footer className="border-t border-zinc-900">\n        ${attributionMarkup}\n      </footer>\n    </body>`,
      );
    }

    if (updated === layout) {
      throw new Error(
        "Failed to inject the attribution markup — couldn't find </body> or </footer> to anchor the insertion. Add manually.",
      );
    }

    await project.writeFile(layoutPath, updated);

    const result = project.commitIfClean({
      wasCleanBefore,
      filesToStage: [layoutPath],
      message: `feat: add KumoKodo footer attribution (${variant} variant)\n\nApplied via roushi pattern kumokodo-footer.\nPer portfolio-kumokodo-footer-attribution rule.`,
    });

    if (result.warning) {
      console.warn(`⚠ ${result.warning}`);
    }
  },
};
