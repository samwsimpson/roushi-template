// Pattern system — typed transformations that can be detected and applied
// to a project. Each pattern is a TypeScript file in src/patterns/<slug>.ts
// that exports a `pattern: Pattern` const. The CLI discovers them via
// the registry in ./registry.ts.
//
// Patterns are the "snippet + env var + commit" automation for portfolio-wide
// changes (Google Analytics, KumoKodo footer, Vercel Analytics, Aether widget,
// etc.). Each pattern declares how to detect its current state on a project
// and how to apply itself, with proper rollback safety.

import type { Project } from "./_project.js";

export interface ParameterDef {
  /** Plain TypeScript type for the parameter value */
  type: "string" | "number" | "boolean";
  /** Prompt text shown when invoked interactively without --param */
  prompt: string;
  /** Example value shown alongside the prompt */
  example?: string;
  /** Whether the parameter must be supplied (CLI errors if missing) */
  required: boolean;
  /** Default value if not supplied. Only used when required is false. */
  default?: string | number | boolean;
}

export type ParameterMap = Record<string, ParameterDef>;

export type ParameterValues<P extends ParameterMap> = {
  [K in keyof P]: P[K]["type"] extends "string"
    ? string
    : P[K]["type"] extends "number"
      ? number
      : boolean;
};

export type DetectionStatus =
  | "applied"
  | "not-applied"
  | "partial"
  | "error"
  | "incompatible";

export interface DetectionResult {
  status: DetectionStatus;
  /** Human-readable detail surfaced in CLI + UI */
  detail?: string;
  /** When status is "partial", list of missing pieces (machine-readable) */
  missing?: string[];
  /** When status is "applied", any params we can recover for display */
  appliedParams?: Record<string, string | number | boolean>;
}

export interface PatternCategory {
  slug: string;
  label: string;
}

export const PATTERN_CATEGORIES: Record<string, PatternCategory> = {
  analytics: { slug: "analytics", label: "Analytics" },
  branding: { slug: "branding", label: "Branding" },
  integrations: { slug: "integrations", label: "Integrations" },
  security: { slug: "security", label: "Security" },
  observability: { slug: "observability", label: "Observability" },
};

export interface Pattern<P extends ParameterMap = ParameterMap> {
  /** Globally unique slug (kebab-case) */
  slug: string;
  /** Human-readable name */
  name: string;
  /** One-line description shown in `pattern list` */
  description: string;
  /** Category for grouping in the UI */
  category: keyof typeof PATTERN_CATEGORIES;
  /** Parameters required to apply this pattern */
  parameters: P;
  /**
   * Determine whether this pattern applies to the given project type.
   * Return false to mark as "incompatible" without running detect/apply.
   * Use to skip e.g. WordPress-only patterns on Next.js projects.
   */
  compatible?: (project: Project) => Promise<boolean> | boolean;
  /** Inspect the project — is the pattern already applied? Partial? Missing? */
  detect: (project: Project) => Promise<DetectionResult>;
  /**
   * Apply the pattern. Should be idempotent — re-running on an already-applied
   * project is a no-op (or only fills in missing pieces).
   * Must call project.commit() at the end if changes were made (the Project
   * helper enforces clean-vs-dirty repo semantics).
   */
  apply: (
    project: Project,
    params: ParameterValues<P>,
  ) => Promise<void>;
}

/**
 * Type guard for pattern module exports — used by the registry to validate
 * that a discovered module actually exports a valid pattern.
 */
export function isPattern(value: unknown): value is Pattern {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.slug === "string" &&
    typeof p.name === "string" &&
    typeof p.description === "string" &&
    typeof p.category === "string" &&
    typeof p.parameters === "object" &&
    typeof p.detect === "function" &&
    typeof p.apply === "function"
  );
}
