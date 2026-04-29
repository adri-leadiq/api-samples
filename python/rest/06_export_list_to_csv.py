"""
06_export_list_to_csv.py — Retrieve a Prospector list and export it to CSV.

This sample reads the list created by 04_create_prospector_list.py, fetches
all prospects from that list via the LeadIQ Prospector API, and saves the
results to output/prospects.csv — a file you can open directly in Excel or
Google Sheets.

What is pagination?
  When a list has many people, the API does not return them all at once.
  Instead it returns a "page" of results (up to 100 at a time) and a cursor —
  a bookmark that tells you where the next page starts.  This script keeps
  requesting the next page until there are no more left, then combines
  everything into one CSV file.

Run it with:
    python rest/06_export_list_to_csv.py
"""

import base64
import csv
import json
import os
import sys
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
LIST_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "output", "prospector_list.json")
)

# Where to write the final CSV file.
OUTPUT_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "output", "prospects.csv")
)

# How many prospects to request per API call.
# 100 is the maximum the API allows, so we use that to minimise the number
# of calls (and the time the script takes to run).
PAGE_SIZE = 100

# The columns that will appear in the CSV file, in left-to-right order.
# Each name here matches a key in the flat dictionary returned by flatten().
CSV_FIELDS = [
    "id",               # unique LeadIQ identifier for this prospect
    "name",             # full name
    "first_name",
    "last_name",
    "title",            # job title, e.g. "VP of Sales"
    "work_email",       # professional email address
    "email_status",     # confidence level: Verified, VerifiedLikely, Unverified, etc.
    "location_city",
    "location_state",
    "location_country",
    "company_name",
    "company_domain",   # company website domain, e.g. "acme.com"
    "company_industry",
    "company_employees",
    "updated_at",       # when this prospect record was last updated in LeadIQ
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_headers():
    return {
        "X-API-Key": _decode_key(API_KEY),
        "Content-Type": "application/json",
    }


def fetch_page(list_id, cursor=None):
    # We send a GET request to /v1/lists/{listId}/prospects.
    # GET is the standard way to "read data" in a REST API — it never changes
    # anything on the server.
    #
    # Query parameters control what we get back:
    #   limit  — how many prospects to return (we use the maximum, 100)
    #   cursor — a bookmark from the previous page; omitted on the first call
    #
    # The API returns:
    #   items      — the list of prospect records for this page
    #   nextCursor — the bookmark for the next page, or null if this is the last
    params = {"limit": PAGE_SIZE}
    if cursor:
        # On every call after the first, pass back the cursor the API gave us.
        # This tells the API "start where you left off."
        params["cursor"] = cursor

    try:
        response = requests.get(
            f"{PROSPECTOR_URL}/v1/lists/{list_id}/prospects",
            params=params,
            headers=get_headers(),
            timeout=30,
        )
        result = response.json()
    except requests.exceptions.Timeout:
        print("Error: The API took too long to respond. Please try again.")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not reach the API. Check your internet connection.")
        sys.exit(1)

    if response.status_code == 401:
        print("Error: Invalid API key.")
        print("Make sure LEADIQ_API_KEY in your .env file is correct.")
        sys.exit(1)
    if response.status_code == 404:
        print("Error: List not found. It may have been deleted in LeadIQ.")
        sys.exit(1)
    if not response.ok:
        print(f"Error {response.status_code}: {result.get('message', 'Unknown error')}")
        sys.exit(1)

    return result["items"], result["nextCursor"]


def flatten(prospect):
    # The API returns nested objects — for example, location and company details
    # are each their own sub-object inside the prospect record.
    #
    # CSV files are flat (one value per column), so we pull the nested values
    # out and put them in a single-level dictionary.  The keys become the
    # column headers in the CSV file.
    loc     = prospect.get("location") or {}
    company = prospect.get("company")  or {}

    return {
        "id":                prospect.get("id"),
        "name":              prospect.get("name"),
        "first_name":        prospect.get("firstName"),
        "last_name":         prospect.get("lastName"),
        "title":             prospect.get("title"),
        "work_email":        prospect.get("workEmail"),
        "email_status":      prospect.get("emailStatus"),
        "location_city":     loc.get("city"),
        "location_state":    loc.get("state"),
        "location_country":  loc.get("country"),
        "company_name":      company.get("name"),
        "company_domain":    company.get("domain"),
        "company_industry":  company.get("industry"),
        "company_employees": company.get("employees"),
        "updated_at":        prospect.get("updatedAt"),
    }

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not API_KEY:
        print("Error: LEADIQ_API_KEY is not set.")
        print("  1. Copy .env.example to .env")
        print("  2. Open .env and paste your Secret Base64 API key")
        sys.exit(1)

    if not os.path.exists(LIST_PATH):
        print(f"Error: List file not found: {LIST_PATH}")
        print("Run 04_create_prospector_list.py first to create the list.")
        sys.exit(1)

    with open(LIST_PATH) as f:
        prospector_list = json.load(f)

    list_id   = prospector_list["id"]
    list_name = prospector_list["name"]

    print(f"List    : {list_name}")
    print(f"List ID : {list_id}")
    print()

    all_prospects = []
    cursor = None   # no cursor on the first call — start from the beginning
    page = 1

    # Keep fetching pages until the API tells us there are no more.
    while True:
        print(f"Fetching page {page}...", end=" ", flush=True)
        items, next_cursor = fetch_page(list_id, cursor)
        print(f"{len(items)} prospects")

        # Flatten each prospect and add it to our running list.
        all_prospects.extend(flatten(p) for p in items)

        # When nextCursor is null (None in Python), we have reached the last page.
        if not next_cursor:
            break

        # Save the cursor so the next loop iteration starts where this one ended.
        cursor = next_cursor
        page += 1

    print()
    print(f"Total   : {len(all_prospects)} prospects retrieved")

    # Write all prospects to a CSV file.
    # newline="" is required on Windows to prevent extra blank rows.
    # encoding="utf-8" handles names and characters from any language.
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()    # write the column names as the first row
        writer.writerows(all_prospects)

    print(f"Saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
