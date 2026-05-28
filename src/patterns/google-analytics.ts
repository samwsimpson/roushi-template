// Google Analytics pattern — the headline pattern that proves the
// pattern system's value. Fully automatic:
//
//   1. Detects existing GA property (or creates one via Admin API)
//   2. Creates a web data stream for the project's domain
//   3. Installs @next/third-parties
//   4. Adds <GoogleAnalytics gaId={...} /> to the root layout
//   5. Sets NEXT_PUBLIC_GA_ID on Vercel + .env.local
//   6. Auto-commits if the repo was clean

import { GoogleAuth } from "google-auth-library";
import type { Pattern } from "./_types";
import type { Project } from "./_project";

const PACKAGE = "@next/third-parties";
const IMPORT_LINE = `import { GoogleAnalytics } from "@next/third-parties/google";`;
const ENV_VAR = "NEXT_PUBLIC_GA_ID";

interface GaAccountSummary {
  account: string;
  displayName: string;
  propertySummaries?: Array<{
    property: string;
    displayName: string;
  }>;
}

interface GaProperty {
  name: string;
  displayName: string;
}

interface GaDataStream {
  name: string;
  webStreamData?: {
    measurementId: string;
    defaultUri: string;
  };
}

export const pattern: Pattern = {
  slug: "google-analytics",
  name: "Google Analytics (GA4)",
  description:
    "Auto-creates a GA4 property + data stream via the Admin API, then wires @next/third-parties into the root layout.",
  category: "analytics",
  parameters: {
    propertyName: {
      type: "string",
      prompt: "Display name for the GA property",
      example: "My Product",
      required: false,
    },
    siteUrl: {
      type: "string",
      prompt: "Site URL for the GA data stream",
      example: "https://example.com",
      required: false,
    },
  },

  async detect(project) {
    const hasPackage = await project.hasDependency(PACKAGE);
    const hasComponent = project.grep("<GoogleAnalytics", { glob: "*.tsx" });
    const hasEnvVar = await project.envHas(ENV_VAR);

    const applied = hasPackage && hasComponent && hasEnvVar;
    if (applied) return { status: "applied" };

    const partial = hasPackage || hasComponent || hasEnvVar;
    if (partial) {
      return {
        status: "partial",
        missing: [
          ...(hasPackage ? [] : ["package"]),
          ...(hasComponent ? [] : ["component"]),
          ...(hasEnvVar ? [] : ["env-var"]),
        ],
      };
    }
    return { status: "not-applied" };
  },

  async apply(project, params) {
    const accountId = process.env.GOOGLE_GA_ACCOUNT_ID;
    if (!accountId) {
      throw new Error(
        "GOOGLE_GA_ACCOUNT_ID env var not set. See .env.example for GA setup.",
      );
    }

    const propertyName =
      String(params.propertyName ?? project.productSlug ?? "").trim() ||
      project.productSlug ||
      "New Property";
    const siteUrl =
      String(params.siteUrl ?? "").trim() ||
      (project.domain ? `https://${project.domain}` : "");

    if (!siteUrl) {
      throw new Error(
        "siteUrl is required (no domain known for this project). Pass --site-url=https://example.com.",
      );
    }

    const wasCleanBefore = project.isGitClean();

    // Step 1: get or create the GA property + data stream
    const ga = await getOrCreateGaProperty({
      accountId,
      propertyName,
      siteUrl,
    });
    console.log(
      `GA property: ${ga.property.displayName} (${ga.property.name}) → measurement ID ${ga.measurementId}`,
    );

    const filesToStage: string[] = [];

    // Step 2: install the package
    if (!(await project.hasDependency(PACKAGE))) {
      project.installPackage(PACKAGE);
      filesToStage.push("package.json", "pnpm-lock.yaml");
    }

    // Step 3: add the component to the root layout
    const layoutPath = await findLayout(project);
    const layout = await project.readFile(layoutPath);
    if (!layout) throw new Error(`Failed to read ${layoutPath}`);

    if (!(layout.includes(IMPORT_LINE) && layout.includes("<GoogleAnalytics"))) {
      const componentLine = `<GoogleAnalytics gaId={process.env.${ENV_VAR}!} />`;
      let updated = layout;
      if (!updated.includes(IMPORT_LINE)) {
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
      if (!updated.includes("<GoogleAnalytics")) {
        updated = updated.replace(
          /<\/body>/,
          `  ${componentLine}\n      </body>`,
        );
      }
      if (updated === layout) {
        throw new Error(
          "Failed to inject <GoogleAnalytics /> — couldn't find </body> to anchor.",
        );
      }
      await project.writeFile(layoutPath, updated);
      filesToStage.push(layoutPath);
    }

    // Step 4: env var setup
    await project.appendToEnvExample(ENV_VAR, "G-XXXXXXXXXX");
    if (await project.fileExists(".env.example")) {
      filesToStage.push(".env.example");
    }

    // Step 5: push to Vercel (preview + prod + dev so all branches work)
    const vercelResult = project.setVercelEnv(ENV_VAR, ga.measurementId, [
      "production",
      "preview",
      "development",
    ]);
    if (vercelResult.ok) {
      console.log(`Set ${ENV_VAR}=${ga.measurementId} on Vercel`);
    } else {
      console.warn(
        `⚠ Could not set ${ENV_VAR} on Vercel: ${vercelResult.error}. ` +
          `Add manually: ${ga.measurementId}`,
      );
    }

    // Step 6: commit
    if (filesToStage.length > 0) {
      const result = project.commitIfClean({
        wasCleanBefore,
        filesToStage: [...new Set(filesToStage)],
        message: `feat: add Google Analytics (${ga.measurementId})\n\nAuto-applied via roushi pattern google-analytics.\nGA property: ${ga.property.displayName}\nMeasurement ID: ${ga.measurementId}`,
      });
      if (result.warning) console.warn(`⚠ ${result.warning}`);
    }

    console.log(
      `\n✓ Google Analytics wired up. Measurement ID: ${ga.measurementId}`,
    );
  },
};

// ─── Helpers ────────────────────────────────────────────────

async function findLayout(project: Project): Promise<string> {
  const candidates = ["src/app/layout.tsx", "app/layout.tsx"];
  for (const c of candidates) {
    if (await project.fileExists(c)) return c;
  }
  throw new Error(
    "Could not find root layout (looked at src/app/layout.tsx and app/layout.tsx). " +
      "This pattern only supports Next.js App Router projects.",
  );
}

async function gaFetch(
  url: string,
  init: RequestInit & { token: string },
): Promise<unknown> {
  const { token, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...rest.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA API ${res.status}: ${body}`);
  }
  return res.json();
}

async function getGaAuthToken(): Promise<string> {
  // google-auth-library auto-detects credentials from
  // GOOGLE_APPLICATION_CREDENTIALS (local file path) OR
  // GOOGLE_SERVICE_ACCOUNT_JSON (stringified JSON, for Vercel).
  let credentials: object | undefined;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) as object;
  }
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/analytics.edit"],
    ...(credentials ? { credentials } : {}),
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Failed to get GA access token from credentials.");
  }
  return token.token;
}

async function getOrCreateGaProperty(args: {
  accountId: string;
  propertyName: string;
  siteUrl: string;
}): Promise<{ property: GaProperty; measurementId: string }> {
  const token = await getGaAuthToken();

  // Check if a property with this display name already exists under the account
  const summaries = (await gaFetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { method: "GET", token },
  )) as { accountSummaries?: GaAccountSummary[] };

  const ourAccount = summaries.accountSummaries?.find(
    (a) => a.account === `accounts/${args.accountId}`,
  );

  let property: GaProperty;
  const existing = ourAccount?.propertySummaries?.find(
    (p) => p.displayName.toLowerCase() === args.propertyName.toLowerCase(),
  );

  if (existing) {
    property = { name: existing.property, displayName: existing.displayName };
    console.log(`Reusing existing GA property: ${existing.displayName}`);
  } else {
    property = (await gaFetch(
      "https://analyticsadmin.googleapis.com/v1beta/properties",
      {
        method: "POST",
        token,
        body: JSON.stringify({
          parent: `accounts/${args.accountId}`,
          displayName: args.propertyName,
          timeZone: "America/Chicago",
          currencyCode: "USD",
        }),
      },
    )) as GaProperty;
    console.log(`Created GA property: ${property.displayName}`);
  }

  // Check for an existing web data stream on this property
  const streamsRes = (await gaFetch(
    `https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams`,
    { method: "GET", token },
  )) as { dataStreams?: GaDataStream[] };

  const existingStream = streamsRes.dataStreams?.find(
    (s) => s.webStreamData?.defaultUri === args.siteUrl,
  );

  let stream: GaDataStream;
  if (existingStream) {
    stream = existingStream;
  } else {
    stream = (await gaFetch(
      `https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams`,
      {
        method: "POST",
        token,
        body: JSON.stringify({
          type: "WEB_DATA_STREAM",
          displayName: args.propertyName,
          webStreamData: { defaultUri: args.siteUrl },
        }),
      },
    )) as GaDataStream;
  }

  const measurementId = stream.webStreamData?.measurementId;
  if (!measurementId) {
    throw new Error(
      `Data stream created but no measurement ID returned. Got: ${JSON.stringify(stream)}`,
    );
  }

  return { property, measurementId };
}
