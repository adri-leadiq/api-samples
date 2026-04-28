/**
 * 02_advanced_search.ts — Find people using advanced filters.
 *
 * This sample searches for Sales professionals at VP, Director, and Manager
 * level located in New Hampshire, and saves their LeadIQ IDs to
 * output/advanced_search_ids.json.
 *
 * IMPORTANT: Each page of results consumes one "Advanced Search (Page)" credit.
 *
 * Run it with:
 *   npx ts-node graphql/02_advanced_search.ts
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load the LEADIQ_API_KEY from the .env file in the typescript/ folder.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Configuration ─────────────────────────────────────────────────────────────

// The URL every LeadIQ GraphQL request is sent to.
const GRAPHQL_URL = "https://api.leadiq.com/graphql";

// Your API key is loaded from the .env file — never hard-code it here.
const API_KEY = process.env.LEADIQ_API_KEY;

// How many results to fetch per API call.
// Increasing this reduces the number of API calls (and credits used),
// but each call still counts as one credit regardless of page size.
const PAGE_SIZE = 25;

// ── Search filters ─────────────────────────────────────────────────────────────

// The seniority levels we want to include.
const SENIORITIES = ["VP", "Director", "Manager"];

// The job function we want to filter by.
// Common values: "Sales", "Marketing", "Engineering", "Finance", "Operations"
const ROLES = ["Sales"];

// The location we want to search in.
// areaLevel1 is the state or province (e.g. "New Hampshire", "California").
// country should match the full country name.
const LOCATION = {
  areaLevel1: "New Hampshire",
  country: "United States",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphQLError {
  message: string;
  extensions?: {
    response?: {
      status?: number;
    };
  };
}

// Shape of the flatAdvancedSearch response data.
interface AdvancedSearchData {
  totalPeople: number;
  people: Array<{ id: string }>;
}

interface AdvancedSearchResponse {
  data?: {
    flatAdvancedSearch: AdvancedSearchData;
  };
  errors?: GraphQLError[];
}

// ── Query ──────────────────────────────────────────────────────────────────────

// We only request the `id` field — add more fields here if needed later.
// See the LeadIQ API docs for the full list of available person fields.
const ADVANCED_SEARCH_QUERY = `
query FlatAdvancedSearch($input: FlatSearchInput!) {
  flatAdvancedSearch(input: $input) {
    totalPeople
    people {
      id
    }
  }
}
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Send one GraphQL request and return the flatAdvancedSearch payload.
 * Exits the process if the network request fails or the API returns an error.
 */
async function callApi(
  headers: Record<string, string>,
  variables: object
): Promise<AdvancedSearchData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let result: AdvancedSearchResponse;
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: ADVANCED_SEARCH_QUERY, variables }),
      signal: controller.signal,
    });
    result = (await response.json()) as AdvancedSearchResponse;
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

  if (result.errors) {
    const error = result.errors[0];
    const status = error.extensions?.response?.status;

    if (status === 401) {
      console.error("Error: Invalid API key.");
      console.error(
        "Make sure LEADIQ_API_KEY in your .env file is the correct Secret Base64 key."
      );
    } else if (status === 402) {
      console.error("Error: Insufficient credits.");
    } else if (status === 429) {
      console.error("Error: Too many requests. Wait a moment and try again.");
    } else {
      console.error(`API error: ${error.message ?? "Unknown error"}`);
    }
    process.exit(1);
  }

  return result.data!.flatAdvancedSearch;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("Error: LEADIQ_API_KEY is not set.");
    console.error("  1. Copy .env.example to .env");
    console.error("  2. Open .env and paste your Secret Base64 API key");
    process.exit(1);
  }

  const headers = {
    Authorization: `Basic ${API_KEY}`,
    "Content-Type": "application/json",
  };

  console.log("Searching LeadIQ API...");
  console.log(`  Roles      : ${ROLES.join(", ")}`);
  console.log(`  Seniorities: ${SENIORITIES.join(", ")}`);
  console.log(`  Location   : ${LOCATION.areaLevel1}, ${LOCATION.country}`);
  console.log();

  const allIds: string[] = [];
  let skip = 0;

  // Loop through pages until we have fetched all results.
  // Each iteration is one API call and consumes one credit.
  while (true) {
    const variables = {
      input: {
        contactFilter: {
          roles: ROLES,
          seniorities: SENIORITIES,
          locations: [LOCATION],
        },
        limit: PAGE_SIZE,
        skip,
      },
    };

    const data = await callApi(headers, variables);
    const { totalPeople, people } = data;

    // On the first page, show the total so the user knows what to expect.
    if (skip === 0) {
      if (totalPeople === 0) {
        console.log("No results found. Try adjusting the filters.");
        return;
      }
      console.log(
        `Found ${totalPeople} people. Fetching IDs (${PAGE_SIZE} per page)...\n`
      );
    }

    // Collect the IDs from this page.
    for (const person of people) {
      allIds.push(person.id);
    }

    // Stop when we have fetched everything.
    if (skip + people.length >= totalPeople) {
      break;
    }

    skip += PAGE_SIZE;
  }

  // Print all collected IDs.
  console.log("#".padEnd(6) + "ID");
  console.log("-".repeat(50));
  allIds.forEach((id, index) => {
    console.log(String(index + 1).padEnd(6) + id);
  });

  console.log(`\nTotal: ${allIds.length} IDs retrieved.`);

  // Save to output/advanced_search_ids.json for use in other samples.
  const outputPath = path.join(__dirname, "..", "output", "advanced_search_ids.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allIds, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main();
