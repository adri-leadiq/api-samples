#!/usr/bin/env bash
# 06_export_list_to_csv.sh — Retrieve a Prospector list and export it to CSV.
#
# Reads the list ID saved by 04_create_prospector_list.sh, fetches all
# prospects from that list via the LeadIQ Prospector API (handling pagination
# automatically), and saves the results to output/prospects.csv — a file you
# can open directly in Excel or Google Sheets.
#
# What is pagination?
#   When a list has many people, the API does not return them all at once.
#   Instead it returns a "page" of results (up to 100 at a time) and a cursor —
#   a bookmark that tells you where the next page starts.  This script keeps
#   requesting the next page until there are no more left, then combines
#   everything into one CSV file.
#
# Usage:
#   export LEADIQ_API_KEY=your_secret_base64_key
#   bash rest/06_export_list_to_csv.sh

# ── Configuration ─────────────────────────────────────────────────────────────

PROSPECTOR_URL="https://prospector.leadiq.com"

if [[ -z "${LEADIQ_API_KEY:-}" ]]; then
  echo "Error: LEADIQ_API_KEY is not set."
  echo "  Run: export LEADIQ_API_KEY=your_secret_base64_key"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "Error: curl is required but not installed."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIST_ID_FILE="$SCRIPT_DIR/../output/prospector_list_id.txt"
OUTPUT_CSV="$SCRIPT_DIR/../output/prospects.csv"

# How many prospects to fetch per API call (max 100).
PAGE_SIZE=100

# ── Decode API key ─────────────────────────────────────────────────────────────

PROSPECTOR_KEY=$(printf '%s' "$LEADIQ_API_KEY" | base64 -d 2>/dev/null \
  || printf '%s' "$LEADIQ_API_KEY" | base64 -D 2>/dev/null)

if [[ -z "$PROSPECTOR_KEY" ]]; then
  echo "Error: Could not decode the API key."
  exit 1
fi

# ── Load inputs ────────────────────────────────────────────────────────────────

if [[ ! -f "$LIST_ID_FILE" ]]; then
  echo "Error: List ID file not found: $LIST_ID_FILE"
  echo "Run 04_create_prospector_list.sh first to create the list."
  exit 1
fi

list_id=$(grep -m1 '[0-9a-fA-F]\{24\}' "$LIST_ID_FILE")

if [[ -z "$list_id" ]]; then
  echo "Error: Could not read list ID from $LIST_ID_FILE"
  exit 1
fi

echo "List ID : $list_id"
echo ""

# ── Helpers ────────────────────────────────────────────────────────────────────

# Extract a flat string field from a JSON fragment.
# Usage: extract_field "$json" "fieldName"
extract_field() {
  echo "$1" | grep -oE "\"$2\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

# Extract a numeric field from a JSON fragment.
# Usage: extract_number "$json" "fieldName"
extract_number() {
  echo "$1" | grep -oE "\"$2\":[0-9]+" | head -1 | cut -d':' -f2
}

# Extract a nested object by key and return its JSON content.
# Works by stripping everything up to and including "key": from the string.
# Usage: extract_object "$json" "key"
extract_object() {
  local after="${1#*\"$2\":}"
  echo "$after"
}

# Wrap a value in double quotes for CSV output.
# Any double quotes inside the value are escaped by doubling them ("" in CSV).
csv_quote() {
  local val="${1//\"/\"\"}"
  echo "\"$val\""
}

# ── Set up output file ─────────────────────────────────────────────────────────

mkdir -p "$(dirname "$OUTPUT_CSV")"

# Write the CSV header row — the column names that spreadsheet apps will show.
printf '%s\n' \
  "id,name,first_name,last_name,title,work_email,email_status,location_city,location_state,location_country,company_name,company_domain,company_industry,company_employees,updated_at" \
  > "$OUTPUT_CSV"

# ── Paginate through prospects ─────────────────────────────────────────────────

cursor=""
page=1
total_written=0

# Keep fetching pages until the API tells us there are no more.
while true; do
  # Build the URL.  On the first call there is no cursor.
  # On subsequent calls we append the cursor the API gave us last time.
  if [[ -n "$cursor" ]]; then
    url="$PROSPECTOR_URL/v1/lists/$list_id/prospects?limit=$PAGE_SIZE&cursor=$cursor"
  else
    url="$PROSPECTOR_URL/v1/lists/$list_id/prospects?limit=$PAGE_SIZE"
  fi

  printf "Fetching page %d..." "$page"

  # Send a GET request — the REST way of "reading data without changing anything."
  response=$(curl -s --max-time 30 \
    -H "X-API-Key: $PROSPECTOR_KEY" \
    -H "Content-Type: application/json" \
    "$url" \
    -w "\n%{http_code}") || {
    echo ""
    echo "Error: Could not reach the API. Check your internet connection."
    exit 1
  }

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  case "$http_code" in
    200) ;;
    401) echo ""; echo "Error: Invalid API key."; exit 1 ;;
    404) echo ""; echo "Error: List not found. It may have been deleted."; exit 1 ;;
    *)
      msg=$(echo "$body" | grep -oE '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
      echo ""; echo "Error $http_code: ${msg:-Unknown error}"; exit 1 ;;
  esac

  # Split the items array into individual prospect JSON objects.
  # Each prospect starts with {"id":"<24-char hex>", so we split on that pattern.
  # The sed command inserts a newline before each prospect boundary.
  items_raw=$(echo "$body" | grep -oE '"items":\[.*\]' | sed 's/"items":\[//;s/\]$//')
  items_split=$(echo "$items_raw" | sed 's/},{"id"/}\n{"id"/g')

  item_count=0
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue

    # Extract flat top-level fields.
    id=$(extract_field "$item" "id")
    name=$(extract_field "$item" "name")
    first=$(extract_field "$item" "firstName")
    last=$(extract_field "$item" "lastName")
    title=$(extract_field "$item" "title")
    email=$(extract_field "$item" "workEmail")
    email_status=$(extract_field "$item" "emailStatus")
    updated_at=$(extract_field "$item" "updatedAt")

    # Extract prospect location (the first "location" object in the JSON).
    # We use bash string stripping to isolate the location sub-object.
    loc_part=$(extract_object "$item" "location")
    loc_city=$(extract_field "$loc_part" "city")
    loc_state=$(extract_field "$loc_part" "state")
    loc_country=$(extract_field "$loc_part" "country")

    # Extract company fields from the "company" sub-object.
    co_part=$(extract_object "$item" "company")
    co_name=$(extract_field "$co_part" "name")
    co_domain=$(extract_field "$co_part" "domain")
    co_industry=$(extract_field "$co_part" "industry")
    co_employees=$(extract_number "$co_part" "employees")

    # Write one CSV row with all fields quoted.
    printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
      "$(csv_quote "$id")"           \
      "$(csv_quote "$name")"         \
      "$(csv_quote "$first")"        \
      "$(csv_quote "$last")"         \
      "$(csv_quote "$title")"        \
      "$(csv_quote "$email")"        \
      "$(csv_quote "$email_status")" \
      "$(csv_quote "$loc_city")"     \
      "$(csv_quote "$loc_state")"    \
      "$(csv_quote "$loc_country")"  \
      "$(csv_quote "$co_name")"      \
      "$(csv_quote "$co_domain")"    \
      "$(csv_quote "$co_industry")"  \
      "$(csv_quote "$co_employees")" \
      "$(csv_quote "$updated_at")"   \
      >> "$OUTPUT_CSV"

    item_count=$((item_count + 1))
    total_written=$((total_written + 1))
  done <<< "$items_split"

  echo " $item_count prospects"

  # Check whether the API gave us a cursor for the next page.
  # If nextCursor is null, this is the last page.
  if echo "$body" | grep -q '"nextCursor":null'; then
    break
  fi

  # Extract the cursor value for the next call.
  cursor=$(echo "$body" | grep -oE '"nextCursor":"[0-9a-fA-F]{24}"' | cut -d'"' -f4)
  [[ -z "$cursor" ]] && break

  page=$((page + 1))
done

echo ""
echo "Total   : $total_written prospects retrieved"
echo "Saved to: $OUTPUT_CSV"
