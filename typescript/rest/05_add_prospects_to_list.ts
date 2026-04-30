/**
 * 05_add_prospects_to_list.ts — Add enriched profiles to a Prospector list.
 *
 * This sample reads two files produced by earlier scripts:
 *   - output/prospector_list.json  (the list created by 04_create_prospector_list.ts)
 *   - output/enriched_profiles.json (the profiles enriched by 03_enrich_profiles.ts)
 *
 * It then adds each person as a "prospect" in that list using the LeadIQ
 * Prospector API. A prospect is simply a person record inside a list — think
 * of it as a row in a spreadsheet.
 *
 * IMPORTANT: Adding a prospect does NOT consume additional credits beyond what
 * was already spent in 03_enrich_profiles.ts. This step is free.
 *
 * Run it with:
 *   npx ts-node rest/05_add_prospects_to_list.ts
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Configuration ─────────────────────────────────────────────────────────────

const PROSPECTOR_URL = "https://prospector.leadiq.com";
const API_KEY = process.env.LEADIQ_API_KEY;

// Path to the list file written by 04_create_prospector_list.ts.
const LIST_PATH = path.join(__dirname, "..", "output", "prospector_list.json");

// Path to the enriched profiles written by 03_enrich_profiles.ts.
// Each entry in this file becomes one prospect in the list.
const PROFILES_PATH = path.join(
  __dirname,
  "..",
  "output",
  "enriched_profiles.json"
);

// How long to pause between each API call (in milliseconds).
// A short pause prevents sending requests too quickly and hitting rate limits.
const DELAY_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProspectorList {
  id: string;
  name: string;
}

// Shape of a profile from enriched_profiles.json — must mirror the shape
// emitted by 03_enrich_profiles.ts.
interface EnrichedProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  function: string | null;
  company: string | null;
  work_email: string | null;
  work_email_status: string | null;
  direct_phone: string | null;
  linkedin_url: string | null;
}

// Allowed values for `emailStatus` and `seniority` on the Prospector API
// input.  Anything else gets a 400 from the server, so we filter
// client-side and drop the field rather than fail the whole add.
const ALLOWED_EMAIL_STATUSES = new Set([
  "Verified",
  "VerifiedLikely",
  "Unverified",
]);
const ALLOWED_SENIORITIES = new Set([
  "VP",
  "Manager",
  "Director",
  "Executive",
  "SeniorIndividualContributor",
  "Other",
]);

interface ProspectInput {
  firstName: string;
  lastName: string;
  title?: string;
  seniority?: string;
  function?: string;
  company?: string;
  workEmail?: string;
  emailStatus?: string;
  mobilePhone?: string;
  linkedinUrl?: string;
}

interface Prospect {
  id: string;
  firstName?: string;
  lastName?: string;
}

// ── Authentication ─────────────────────────────────────────────────────────────

function decodeKey(key: string): string {
  // The Prospector API needs the raw decoded version of the base64 API key.
  return Buffer.from(key, "base64").toString("utf-8");
}

function prospectorHeaders(): Record<string, string> {
  return {
    "X-API-Key": decodeKey(API_KEY!),
    "Content-Type": "application/json",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function addProspect(
  listId: string,
  profile: EnrichedProfile
): Promise<Prospect | null> {
  // We send a POST request to /v1/lists/{listId}/prospects.
  // The {listId} part of the URL tells the API which list to add the person to.
  //
  // We map the fields from our enriched profile to the fields the API expects.
  // The API only requires first and last name; everything else is optional
  // but makes the prospect record more useful.

  const first = (profile.first_name ?? "").trim();
  const last = (profile.last_name ?? "").trim();

  // Without a first or last name the API will reject the request.
  if (!first || !last) return null;

  const body: ProspectInput = { firstName: first, lastName: last };
  if (profile.title)        body.title       = profile.title;
  if (profile.company)      body.company     = profile.company;
  if (profile.work_email)   body.workEmail   = profile.work_email;
  // direct_phone comes from personalPhones in the enrichment step.
  // The Prospector API stores this as a mobile phone number.
  if (profile.direct_phone) body.mobilePhone = profile.direct_phone;
  if (profile.linkedin_url) body.linkedinUrl = profile.linkedin_url;
  // Forward the email confidence from the enrichment step so Prospector
  // doesn't default the lead's email status to Unverified.
  if (profile.work_email_status && ALLOWED_EMAIL_STATUSES.has(profile.work_email_status)) {
    body.emailStatus = profile.work_email_status;
  }
  // Seniority from the enrichment step.  Prospector accepts only the
  // canonical enum values; anything else is dropped client-side rather
  // than 400-ing the whole add.
  if (profile.seniority && ALLOWED_SENIORITIES.has(profile.seniority)) {
    body.seniority = profile.seniority;
  }
  if (profile.function) body.function = profile.function;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(
      `${PROSPECTOR_URL}/v1/lists/${listId}/prospects`,
      {
        method: "POST",
        headers: prospectorHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (response.status === 401) {
      console.error("\nError: Invalid API key.");
      process.exit(1);
    }
    if (!response.ok) {
      process.stdout.write(`error ${response.status} — skipped\n`);
      return null;
    }

    return (await response.json()) as Prospect;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      process.stdout.write("timeout — skipped\n");
    } else {
      process.stdout.write("connection error — skipped\n");
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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

  if (!fs.existsSync(PROFILES_PATH)) {
    console.error(`Error: Profiles file not found: ${PROFILES_PATH}`);
    console.error(
      "Run 03_enrich_profiles.ts first to generate the enriched profiles."
    );
    process.exit(1);
  }

  // Load the list metadata so we can read its ID.
  const prospectorList: ProspectorList = JSON.parse(
    fs.readFileSync(LIST_PATH, "utf-8")
  );

  // Load all the enriched profiles we want to add.
  const profiles: EnrichedProfile[] = JSON.parse(
    fs.readFileSync(PROFILES_PATH, "utf-8")
  );

  if (profiles.length === 0) {
    console.error(
      "Error: The enriched profiles file is empty. Run 03_enrich_profiles.ts first."
    );
    process.exit(1);
  }

  const listId = prospectorList.id;
  const listName = prospectorList.name;
  const total = profiles.length;

  console.log(`List       : ${listName}`);
  console.log(`List ID    : ${listId}`);
  console.log(`Profiles   : ${total}`);
  console.log();

  const added: Prospect[] = [];
  let skipped = 0;

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const name =
      profile.full_name ||
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      "—";

    process.stdout.write(`[${i + 1}/${total}] ${name} ... `);

    const prospect = await addProspect(listId, profile);

    if (prospect === null) {
      console.log("skipped");
      skipped++;
    } else {
      console.log("added");
      added.push(prospect);
    }

    // Wait a moment before the next call to stay within rate limits.
    if (i < profiles.length - 1) await sleep(DELAY_MS);
  }

  console.log();
  console.log(`Added   : ${added.length}`);
  console.log(`Skipped : ${skipped}`);

  // Save the added prospect records so later samples can reference them.
  const outputPath = path.join(
    __dirname,
    "..",
    "output",
    "added_prospects.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(added, null, 2));
  console.log(`Saved to  : ${outputPath}`);
}

main();
