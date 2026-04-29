#!/usr/bin/env bash
# 05_add_prospects_to_list.sh — Add enriched profiles to a Prospector list.
#
# This script reads two files produced by earlier scripts:
#   - output/prospector_list_id.txt  (the list ID saved by 04_create_prospector_list.sh)
#   - output/enriched_profiles.txt   (the profiles enriched by 03_enrich_profiles.sh)
#
# It then adds each person as a "prospect" in that list via the LeadIQ
# Prospector API.
#
# IMPORTANT: Adding a prospect does NOT consume additional credits beyond what
# was already spent in 03_enrich_profiles.sh.  This step is free.
#
# Usage:
#   export LEADIQ_API_KEY=your_secret_base64_key
#   bash rest/05_add_prospects_to_list.sh

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
PROFILES_FILE="$SCRIPT_DIR/../output/enriched_profiles.txt"

# How long to pause between API calls (seconds) to avoid rate-limit errors.
DELAY_BETWEEN_CALLS=0.5

# ── Decode API key ─────────────────────────────────────────────────────────────

# The Prospector API needs the raw decoded version of the base64 API key.
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

if [[ ! -f "$PROFILES_FILE" ]]; then
  echo "Error: Profiles file not found: $PROFILES_FILE"
  echo "Run 03_enrich_profiles.sh first to generate the enriched profiles."
  exit 1
fi

# Read the list ID from the file (just the first non-empty line).
list_id=$(grep -m1 '[0-9a-fA-F]\{24\}' "$LIST_ID_FILE")

if [[ -z "$list_id" ]]; then
  echo "Error: Could not read list ID from $LIST_ID_FILE"
  exit 1
fi

# ── Helpers ────────────────────────────────────────────────────────────────────

# Add one prospect to the list.
# Arguments: $1=first_name, $2=last_name, $3=title, $4=company, $5=work_email, $6=mobile_phone
add_prospect() {
  local first="$1" last="$2" title="$3" company="$4" email="$5" phone="$6"

  # The API requires both first and last name.
  if [[ -z "$first" || -z "$last" ]]; then
    echo "skipped (missing name)"
    return
  fi

  # Build the JSON request body.  We only include optional fields when they
  # have a value so we keep the request clean.
  local body="{\"firstName\":\"$first\",\"lastName\":\"$last\""
  [[ -n "$title"   ]] && body+=",\"title\":\"$title\""
  [[ -n "$company" ]] && body+=",\"company\":\"$company\""
  [[ -n "$email"   ]] && body+=",\"workEmail\":\"$email\""
  # direct_phone comes from personalPhones in the enrichment step.
  # The Prospector API stores this as a mobile phone number.
  [[ -n "$phone"   ]] && body+=",\"mobilePhone\":\"$phone\""
  body+="}"

  local response http_code
  # Send a POST request to /v1/lists/{listId}/prospects.
  # POST creates a new prospect record inside the list.
  response=$(curl -s --max-time 30 \
    -X POST "$PROSPECTOR_URL/v1/lists/$list_id/prospects" \
    -H "X-API-Key: $PROSPECTOR_KEY" \
    -H "Content-Type: application/json" \
    --data-raw "$body" \
    -w "\n%{http_code}") || { echo "connection error — skipped"; return; }

  http_code=$(echo "$response" | tail -1)

  case "$http_code" in
    201) echo "added" ;;
    401) echo "Error: Invalid API key."; exit 1 ;;
    *)   echo "error $http_code — skipped" ;;
  esac
}

# ── Main ───────────────────────────────────────────────────────────────────────

# The enriched_profiles.txt file uses fixed-width columns written by 03_enrich_profiles.sh:
#   Columns: ID(40) Name(25) Work Email(35) Direct Phone(20) Title(rest)
# We skip the first two lines (header row + divider line).
total=$(tail -n +3 "$PROFILES_FILE" | grep -c .)
added=0
skipped=0
i=0

echo "List ID  : $list_id"
echo "Profiles : $total"
echo ""

while IFS= read -r line; do
  i=$((i + 1))

  # Extract each field using bash substring notation: ${var:offset:length}
  # xargs strips leading/trailing whitespace from each extracted value.
  person_id=$(echo "${line:0:40}"  | xargs)
  full_name=$(echo "${line:41:25}" | xargs)
  work_email=$(echo "${line:67:35}" | xargs)
  direct_phone=$(echo "${line:103:20}" | xargs)
  title=$(echo "${line:124}" | xargs)

  # Skip the header row (starts with "ID") and divider lines (start with "-").
  [[ "$person_id" == "ID" || "$person_id" == -* ]] && continue
  # Skip empty lines.
  [[ -z "$person_id" ]] && continue

  # Split full name into first and last.
  # first = first word;  last = everything after the first word.
  first=$(echo "$full_name" | awk '{print $1}')
  last=$(echo "$full_name" | awk '{$1=""; print $0}' | xargs)

  # Replace the placeholder "—" that 03 writes when a field is missing.
  [[ "$work_email"   == "—" ]] && work_email=""
  [[ "$direct_phone" == "—" ]] && direct_phone=""
  [[ "$title"        == "—" ]] && title=""

  printf "[%d/%d] %s ..." "$i" "$total" "$full_name"

  result=$(add_prospect "$first" "$last" "$title" "" "$work_email" "$direct_phone")
  echo " $result"

  if [[ "$result" == "added" ]]; then
    added=$((added + 1))
  else
    skipped=$((skipped + 1))
  fi

  sleep "$DELAY_BETWEEN_CALLS"
done < <(tail -n +3 "$PROFILES_FILE")

echo ""
echo "Added   : $added"
echo "Skipped : $skipped"
