"""
05_add_prospects_to_list.py — Add enriched profiles to a Prospector list.

This sample reads two files produced by earlier scripts:
  - output/prospector_list.json  (the list created by 04_create_prospector_list.py)
  - output/enriched_profiles.json (the profiles enriched by 03_enrich_profiles.py)

It then adds each person as a "prospect" in that list using the LeadIQ
Prospector API.  A prospect is simply a person record inside a list — think
of it as a row in a spreadsheet.

IMPORTANT: Adding a prospect does NOT consume additional credits beyond what
was already spent in 03_enrich_profiles.py.  This step is free.

Run it with:
    python rest/05_add_prospects_to_list.py
"""

import base64
import json
import os
import sys
import time
import requests

# ── Configuration ─────────────────────────────────────────────────────────────

# The base URL for every Prospector API request.
PROSPECTOR_URL = "https://prospector.leadiq.com"

# Your API key is loaded from the .env file — never hard-code it here.
API_KEY = os.getenv("LEADIQ_API_KEY")


def _decode_key(key):
    # The .env file stores the "Secret Base64" key — a base64-encoded string.
    # The Prospector API needs the raw decoded version in the X-API-Key header.
    try:
        return base64.b64decode(key).decode("utf-8")
    except Exception:
        return key


# Path to the list file written by 04_create_prospector_list.py.
# We read this to find out which list to add people to.
LIST_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "output", "prospector_list.json")
)

# Path to the enriched profiles written by 03_enrich_profiles.py.
# Each entry in this file becomes one prospect in the list.
PROFILES_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "output", "enriched_profiles.json")
)

# How long to pause between each API call (in seconds).
# A short pause prevents sending requests too quickly and hitting rate limits.
DELAY_BETWEEN_CALLS = 0.5

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_headers():
    # These headers are sent with every request to identify us and tell the
    # server the request body is formatted as JSON.
    return {
        "X-API-Key": _decode_key(API_KEY),
        "Content-Type": "application/json",
    }


def add_prospect(list_id, profile):
    # We send a POST request to /v1/lists/{listId}/prospects.
    # The {listId} part of the URL tells the API which list to add the person to.
    # POST creates a new resource — in this case, a new prospect record.
    #
    # We map the fields from our enriched profile to the fields the API expects.
    # The API only requires first and last name; everything else is optional
    # but makes the prospect record more useful.

    first = (profile.get("first_name") or "").strip()
    last  = (profile.get("last_name")  or "").strip()

    # Without a first or last name the API will reject the request, so we
    # skip the profile and report it as skipped rather than failing.
    if not first or not last:
        return None, "missing name"

    # Allowed values for `emailStatus` and `seniority` on the Prospector API
    # input. Anything else gets a 400, so we filter client-side and drop the
    # field rather than fail the whole add.
    ALLOWED_EMAIL_STATUSES = {"Verified", "VerifiedLikely", "Unverified"}
    ALLOWED_SENIORITIES = {
        "VP", "Manager", "Director", "Executive",
        "SeniorIndividualContributor", "Other",
    }

    # Build the request body with whatever fields are available.
    # We only include a field if it has a value — sending null fields is fine
    # but skipping them keeps the request clean.
    body = {"firstName": first, "lastName": last}

    if profile.get("title"):
        body["title"] = profile["title"]        # job title, e.g. "VP of Sales"
    if profile.get("company"):
        body["company"] = profile["company"]    # company name
    if profile.get("work_email"):
        body["workEmail"] = profile["work_email"]   # professional email address
    # Forward the email confidence from the enrichment step so Prospector
    # doesn't default the lead's email status to Unverified.
    if profile.get("work_email_status") in ALLOWED_EMAIL_STATUSES:
        body["emailStatus"] = profile["work_email_status"]
    if profile.get("direct_phone"):
        # direct_phone comes from personalPhones in the enrichment step.
        # The Prospector API stores this as a mobile phone number.
        body["mobilePhone"] = profile["direct_phone"]
    if profile.get("linkedin_url"):
        body["linkedinUrl"] = profile["linkedin_url"]
    # Seniority must match the canonical enum values; bad values are dropped
    # client-side rather than 400-ing the whole add.
    if profile.get("seniority") in ALLOWED_SENIORITIES:
        body["seniority"] = profile["seniority"]
    if profile.get("function"):
        body["function"] = profile["function"]

    try:
        response = requests.post(
            f"{PROSPECTOR_URL}/v1/lists/{list_id}/prospects",
            json=body,
            headers=get_headers(),
            timeout=30,
        )
        result = response.json()
    except requests.exceptions.Timeout:
        return None, "timeout"
    except requests.exceptions.ConnectionError:
        return None, "connection error"

    # 401 means our API key is wrong — no point continuing.
    if response.status_code == 401:
        print("Error: Invalid API key.")
        sys.exit(1)
    # Any other non-success status is a skippable error for this person.
    if not response.ok:
        return None, f"error {response.status_code}"

    return result, None

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not API_KEY:
        print("Error: LEADIQ_API_KEY is not set.")
        print("  1. Copy .env.example to .env")
        print("  2. Open .env and paste your Secret Base64 API key")
        sys.exit(1)

    # Make sure both input files exist before we start.
    if not os.path.exists(LIST_PATH):
        print(f"Error: List file not found: {LIST_PATH}")
        print("Run 04_create_prospector_list.py first to create the list.")
        sys.exit(1)

    if not os.path.exists(PROFILES_PATH):
        print(f"Error: Profiles file not found: {PROFILES_PATH}")
        print("Run 03_enrich_profiles.py first to generate the enriched profiles.")
        sys.exit(1)

    # Load the list metadata so we can read its ID.
    with open(LIST_PATH) as f:
        prospector_list = json.load(f)

    # Load all the enriched profiles we want to add.
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)

    if not profiles:
        print("Error: The enriched profiles file is empty. Run 03_enrich_profiles.py first.")
        sys.exit(1)

    list_id   = prospector_list["id"]
    list_name = prospector_list["name"]
    total     = len(profiles)

    print(f"List       : {list_name}")
    print(f"List ID    : {list_id}")
    print(f"Profiles   : {total}")
    print()

    added   = []   # prospects that were successfully added to the list
    skipped = []   # profiles that could not be added, with the reason why

    for i, profile in enumerate(profiles, start=1):
        # Build a display name for the progress output.
        name = (
            profile.get("full_name")
            or f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
            or "—"
        )
        print(f"[{i}/{total}] {name} ...", end=" ", flush=True)

        prospect, reason = add_prospect(list_id, profile)

        if prospect is None:
            print(f"skipped ({reason})")
            skipped.append({"name": name, "reason": reason})
        else:
            print("added")
            added.append(prospect)

        # Wait a moment before the next call to stay within rate limits.
        if i < total:
            time.sleep(DELAY_BETWEEN_CALLS)

    print()
    print(f"Added   : {len(added)}")
    print(f"Skipped : {len(skipped)}")

    # Save the added prospect records so later samples can reference them.
    output_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "output", "added_prospects.json")
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(added, f, indent=2)
    print(f"Saved to  : {output_path}")


if __name__ == "__main__":
    main()
