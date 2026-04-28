/**
 * 01_check_usage.ts — Verify your API key and check your credit balance.
 *
 * This is the simplest call you can make to the LeadIQ API.
 * It does NOT consume any credits.
 *
 * Run it with:
 *   npx ts-node graphql/01_check_usage.ts
 */

import dotenv from "dotenv";
import path from "path";

// Load the LEADIQ_API_KEY from the .env file in the typescript/ folder.
// This must happen before we read process.env below.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Configuration ─────────────────────────────────────────────────────────────

// The URL every LeadIQ GraphQL request is sent to.
const GRAPHQL_URL = "https://api.leadiq.com/graphql";

// Your API key is loaded from the .env file — never hard-code it here.
const API_KEY = process.env.LEADIQ_API_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

// These interfaces describe the shape of the JSON the API sends back.
// TypeScript uses them to catch mistakes at compile time.

interface GraphQLError {
  message: string;
  extensions?: {
    response?: {
      status?: number;
    };
  };
}

interface PlanUsageEntry {
  name: string;
  creditType: string;
  units: number | null;
  cap: number | null;
  billingType: string;
}

interface UsageResponse {
  data?: {
    usage: {
      planUsage: PlanUsageEntry[];
      subscription: { status: string };
    };
  };
  errors?: GraphQLError[];
}

// ── Query ──────────────────────────────────────────────────────────────────────

// This GraphQL query asks the API for your current plan and credit usage.
const USAGE_QUERY = `
query Usage {
  usage {
    planUsage {
      name
      creditType
      units
      cap
      billingType
    }
    subscription {
      status
    }
  }
}
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Send a single GraphQL request to the LeadIQ API.
 * Returns the parsed JSON response.
 * Exits the process if the network request fails.
 */
async function sendRequest(
  headers: Record<string, string>,
  body: object
): Promise<UsageResponse> {
  // AbortController lets us cancel the request if it takes too long.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return (await response.json()) as UsageResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("Error: The API took too long to respond. Please try again.");
    } else {
      console.error("Error: Could not reach the API. Check your internet connection.");
    }
    process.exit(1);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Make sure the API key was loaded. If not, remind the user how to set it up.
  if (!API_KEY) {
    console.error("Error: LEADIQ_API_KEY is not set.");
    console.error("  1. Copy .env.example to .env");
    console.error("  2. Open .env and paste your Secret Base64 API key");
    process.exit(1);
  }

  // Build the HTTP headers. LeadIQ uses HTTP Basic Auth — the API key
  // goes in the Authorization header as the username (no password needed).
  const headers = {
    Authorization: `Basic ${API_KEY}`,
    "Content-Type": "application/json",
  };

  process.stdout.write("Connecting to LeadIQ API... ");

  // Send the request to the API.
  const result = await sendRequest(headers, { query: USAGE_QUERY });

  console.log("done.\n");

  // The LeadIQ API always returns HTTP 200, even for errors.
  // Real error information is inside the "errors" field of the response.
  if (result.errors) {
    const error = result.errors[0];
    const status = error.extensions?.response?.status;

    if (status === 401) {
      console.error("Error: Invalid API key.");
      console.error(
        "Make sure LEADIQ_API_KEY in your .env file is the correct Secret Base64 key."
      );
    } else if (status === 429) {
      console.error("Error: Too many requests. Wait a moment and try again.");
    } else {
      console.error(`API error: ${error.message ?? "Unknown error"}`);
    }
    process.exit(1);
  }

  // Pull out the usage data from the response.
  const { usage } = result.data!;
  const subscriptionStatus = usage.subscription.status;
  const planUsage = usage.planUsage;

  // Print a summary.
  console.log(`Subscription status : ${subscriptionStatus}\n`);

  if (!planUsage || planUsage.length === 0) {
    console.log("No credit usage data available.");
    return;
  }

  // Print each credit type as a table row.
  const col1 = 26, col2 = 20, col3 = 6, col4 = 8;
  console.log(
    "Credit Type".padEnd(col1) +
    " " + "Plan".padEnd(col2) +
    " " + "Used".padStart(col3) +
    " " + "Cap".padStart(col4) +
    "  Billing"
  );
  console.log("-".repeat(70));

  for (const entry of planUsage) {
    const capStr = entry.cap !== null ? String(entry.cap) : "unlimited";
    console.log(
      entry.creditType.padEnd(col1) +
      " " + entry.name.padEnd(col2) +
      " " + String(entry.units ?? 0).padStart(col3) +
      " " + capStr.padStart(col4) +
      "  " + entry.billingType
    );
  }
}

main();
