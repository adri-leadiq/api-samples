#!/usr/bin/env bash
# 04_create_prospector_list.sh — Create a Prospector list.
#
# Creates a list named "Sales Leaders in New Hampshire" in the LeadIQ
# Prospector API and saves the list ID to output/prospector_list_id.txt.
#
# What is the Prospector API?
#   The Prospector API is a REST API — a different style from the GraphQL API
#   used in the earlier samples.  Instead of writing queries, you call specific
#   URLs (called "endpoints") to create or read things.
#
# Authentication note:
#   The Prospector API uses the same API key as the GraphQL API, but expects
#   the raw decoded key in an X-API-Key header instead of Authorization: Basic.
#   This script decodes the key automatically — you do not need to change your
#   LEADIQ_API_KEY value.
#
# Usage:
#   export LEADIQ_API_KEY=your_secret_base64_key
#   bash rest/04_create_prospector_list.sh

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

LIST_NAME="Sales Leaders in New Hampshire"
LIST_DESCRIPTION="VP, Director, and Manager level Sales professionals in New Hampshire — sourced via LeadIQ advanced search."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/../output/prospector_list_id.txt"

# ── Decode API key ─────────────────────────────────────────────────────────────

# The LEADIQ_API_KEY environment variable holds the "Secret Base64" key —
# a base64-encoded string.  The GraphQL API uses it as-is, but the Prospector
# API needs the raw decoded version.
#
# base64 -d works on Linux; base64 -D works on macOS.
# We try both so the script runs on either system.
PROSPECTOR_KEY=$(printf '%s' "$LEADIQ_API_KEY" | base64 -d 2>/dev/null \
  || printf '%s' "$LEADIQ_API_KEY" | base64 -D 2>/dev/null)

if [[ -z "$PROSPECTOR_KEY" ]]; then
  echo "Error: Could not decode the API key."
  exit 1
fi

# ── Call the API ───────────────────────────────────────────────────────────────

echo "Creating list \"$LIST_NAME\"..."

# We send an HTTP POST request to /v1/lists.
# POST is the REST way of saying "create something new."
# The request body is a JSON object with the list name and description.
# curl flags:
#   -s              silent (no progress bar)
#   --max-time 30   give up after 30 seconds
#   -X POST         send a POST request
#   -w "\n%{http_code}"  append the HTTP status code on a new line at the end
response=$(curl -s --max-time 30 \
  -X POST "$PROSPECTOR_URL/v1/lists" \
  -H "X-API-Key: $PROSPECTOR_KEY" \
  -H "Content-Type: application/json" \
  --data-raw "{\"name\":\"$LIST_NAME\",\"description\":\"$LIST_DESCRIPTION\"}" \
  -w "\n%{http_code}") || {
  echo "Error: Could not reach the Prospector API. Check your internet connection."
  exit 1
}

# Split the response body from the HTTP status code.
# The last line is the status code; everything before it is the JSON body.
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

# HTTP status codes tell us whether the request succeeded.
# 201 Created means the list was created successfully.
# 401 means the server did not recognise our API key.
# 409 Conflict means a list with this name already exists.
case "$http_code" in
  201) ;;  # success — continue below
  401)
    echo "Error: Invalid API key."
    echo "Make sure LEADIQ_API_KEY is set to the correct Secret Base64 key."
    exit 1
    ;;
  409)
    echo "Error: A list named \"$LIST_NAME\" already exists."
    echo "Rename it in LeadIQ or change LIST_NAME in this script."
    exit 1
    ;;
  *)
    msg=$(echo "$body" | grep -oE '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Error $http_code: ${msg:-Unknown error}"
    exit 1
    ;;
esac

# Extract the new list's ID from the JSON response.
# The ID is a 24-character hex string like "6627e3f1a2b3c4d5e6f70001".
list_id=$(echo "$body" | grep -oE '"id":"[0-9a-fA-F]{24}"' | head -1 | cut -d'"' -f4)
list_name=$(echo "$body" | grep -oE '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
created_at=$(echo "$body" | grep -oE '"createdAt":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$list_id" ]]; then
  echo "Error: Could not extract list ID from the response."
  echo "Raw response: $body"
  exit 1
fi

echo "Done."
echo ""
echo "  ID         : $list_id"
echo "  Name       : $list_name"
echo "  Created at : $created_at"

# Save the list ID to a file so the next scripts can read it.
# We save just the ID (not the full JSON) because bash reads plain text easily.
mkdir -p "$(dirname "$OUTPUT_FILE")"
printf '%s\n' "$list_id" > "$OUTPUT_FILE"
echo ""
echo "Saved to: $OUTPUT_FILE"
