/**
 * 06_export_list_to_csv.ts — Retrieve a Prospector list and export it to CSV.
 *
 * This sample reads the list created by 04_create_prospector_list.ts, fetches
 * all prospects from that list via the LeadIQ Prospector API (handling
 * pagination automatically), and saves the results to output/prospects.csv —
 * a file you can open directly in Excel or Google Sheets.
 *
 * What is pagination?
 *   When a list has many people, the API does not return them all at once.
 *   Instead it returns a "page" of results (up to 100 at a time) and a cursor —
 *   a bookmark that tells you where the next page starts. This script keeps
 *   requesting the next page until there are no more left, then combines
 *   everything into one CSV file.
 *
 * Run it with:
 *   npx ts-node rest/06_export_list_to_csv.ts
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Configuration ─────────────────────────────────────────────────────────────

const PROSPECTOR_URL = "https://prospector.leadiq.com";
const API_KEY = process.env.LEADIQ_API_KEY;

const LIST_PATH = path.join(__dirname, "..", "output", "prospector_list.json");
const OUTPUT_PATH = path.join(__dirname, "..", "output", "prospects.csv");

// How many prospects to request per API call (max 100).
// Using the maximum minimises the number of calls and time to run.
const PAGE_SIZE = 100;

// The columns that will appear in the CSV file, in left-to-right order.
const CSV_FIELDS = [
  "id",
  "name",
  "first_name",
  "last_name",
  "title",
  "work_email",
  "email_status",
  "location_city",
  "location_state",
  "location_country",
  "company_name",
  "company_domain",
  "company_industry",
  "company_employees",
  "updated_at",
] as const;

type CsvField = (typeof CSV_FIELDS)[number];
type CsvRow = Record<CsvField, string | number | null | undefined>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProspectorList {
  id: string;
  name: string;
}

interface ProspectSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  title?: string;
  workEmail?: string;
  emailStatus?: string;
  location?: { city?: string; state?: string; country?: string };
  company?: {
    name?: string;
    domain?: string;
    industry?: string;
    employees?: number;
    location?: { city?: string; state?: string; country?: string };
  };
  updatedAt: string;
}

interface PaginatedProspects {
  items: ProspectSummary[];
  nextCursor: string | null;
}

// ── Authentication ─────────────────────────────────────────────────────────────

function decodeKey(key: string): string {
  return Buffer.from(key, "base64").toString("utf-8");
}

function prospectorHeaders(): Record<string, string> {
  return {
    "X-API-Key": decodeKey(API_KEY!),
    "Content-Type": "application/json",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchPage(
  listId: string,
  cursor?: string
): Promise<PaginatedProspects> {
  // We send a GET request to /v1/lists/{listId}/prospects.
  // GET is the standard way to "read data" in a REST API — it never changes
  // anything on the server.
  //
  // Query parameters:
  //   limit  — how many prospects to return at once (we use the maximum, 100)
  //   cursor — a bookmark from the previous page; omitted on the first call
  const url = new URL(`${PROSPECTOR_URL}/v1/lists/${listId}/prospects`);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (cursor) url.searchParams.set("cursor", cursor);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url.toString(), {
      headers: prospectorHeaders(),
      signal: controller.signal,
    });
    const result = (await response.json()) as PaginatedProspects & {
      message?: string;
    };

    if (response.status === 401) {
      console.error("Error: Invalid API key.");
      console.error("Make sure LEADIQ_API_KEY in your .env file is correct.");
      process.exit(1);
    }
    if (response.status === 404) {
      console.error("Error: List not found. It may have been deleted in LeadIQ.");
      process.exit(1);
    }
    if (!response.ok) {
      console.error(`Error ${response.status}: ${result.message ?? "Unknown error"}`);
      process.exit(1);
    }

    return result;
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

function flatten(prospect: ProspectSummary): CsvRow {
  // The API returns nested objects — location and company details are each
  // their own sub-object. CSV files are flat (one value per column), so we
  // pull the nested values out into a single-level object.
  const loc = prospect.location ?? {};
  const co = prospect.company ?? {};

  return {
    id:                prospect.id,
    name:              prospect.name,
    first_name:        prospect.firstName,
    last_name:         prospect.lastName,
    title:             prospect.title,
    work_email:        prospect.workEmail,
    email_status:      prospect.emailStatus,
    location_city:     loc.city,
    location_state:    loc.state,
    location_country:  loc.country,
    company_name:      co.name,
    company_domain:    co.domain,
    company_industry:  co.industry,
    company_employees: co.employees,
    updated_at:        prospect.updatedAt,
  };
}

function toCsv(rows: CsvRow[]): string {
  // CSV (Comma-Separated Values) is a plain-text format that every spreadsheet
  // application can open. The first line is the header (column names), and
  // every subsequent line is one row of data.
  //
  // We wrap every value in double quotes to safely handle commas and special
  // characters inside field values.
  const escape = (v: unknown): string =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  const header = CSV_FIELDS.map(escape).join(",");
  const lines = rows.map((row) =>
    CSV_FIELDS.map((f) => escape(row[f])).join(",")
  );
  return [header, ...lines].join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("Error: LEADIQ_API_KEY is not set.");
    console.error("  1. Copy .env.example to .env");
    console.error("  2. Open .env and paste your Secret Base64 API key");
    process.exit(1);
  }

  if (!fs.existsSync(LIST_PATH)) {
    console.error(`Error: List file not found: ${LIST_PATH}`);
    console.error("Run 04_create_prospector_list.ts first to create the list.");
    process.exit(1);
  }

  const prospectorList: ProspectorList = JSON.parse(
    fs.readFileSync(LIST_PATH, "utf-8")
  );

  const listId = prospectorList.id;
  const listName = prospectorList.name;

  console.log(`List    : ${listName}`);
  console.log(`List ID : ${listId}`);
  console.log();

  const allProspects: CsvRow[] = [];
  let cursor: string | undefined;
  let page = 1;

  // Keep fetching pages until the API tells us there are no more.
  while (true) {
    process.stdout.write(`Fetching page ${page}... `);
    const { items, nextCursor } = await fetchPage(listId, cursor);
    console.log(`${items.length} prospects`);

    allProspects.push(...items.map(flatten));

    // When nextCursor is null, we have reached the last page.
    if (!nextCursor) break;

    // Save the cursor so the next iteration starts where this one ended.
    cursor = nextCursor;
    page++;
  }

  console.log();
  console.log(`Total   : ${allProspects.length} prospects retrieved`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, toCsv(allProspects), "utf-8");
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main();
