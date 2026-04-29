"""
04_create_prospector_list.py — Create a Prospector list.

Creates a list named "Sales Leaders in New Hampshire" in the LeadIQ
Prospector API and saves the result to output/prospector_list.json.

What is the Prospector API?
  The Prospector API is a REST API — a different style from the GraphQL API
  used in the earlier samples.  Instead of writing queries, you call specific
  URLs (called "endpoints") to create, read, update, or delete things.
  Each endpoint has a clear purpose, like "create a list" or "add a person".

Authentication note:
  Both APIs share the same API key, but they expect it in different formats.
  The GraphQL API wants it Base64-encoded in an "Authorization: Basic" header.
  The Prospector API wants the raw (decoded) key in an "X-API-Key" header.
  This script handles the decoding automatically — you do not need to change
  anything in your .env file.

Run it with:
    python rest/04_create_prospector_list.py
"""

import base64
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
    # The GraphQL API uses it as-is, but the Prospector API needs the raw
    # version underneath.  base64.b64decode() reverses the encoding.
    # If decoding fails for any reason, we fall back to sending the key as-is.
    try:
        return base64.b64decode(key).decode("utf-8")
    except Exception:
        return key


# The name and description of the list we want to create.
# Change LIST_NAME here if you want to create a list with a different name.
LIST_NAME = "Sales Leaders in New Hampshire"
LIST_DESCRIPTION = (
    "VP, Director, and Manager level Sales professionals in New Hampshire "
    "— sourced via LeadIQ advanced search."
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_headers():
    # HTTP headers are metadata sent with every request.
    # "X-API-Key" tells the server who you are (authentication).
    # "Content-Type: application/json" tells the server the request body is JSON.
    return {
        "X-API-Key": _decode_key(API_KEY),
        "Content-Type": "application/json",
    }


def create_list(name, description):
    # We send an HTTP POST request to /v1/lists.
    # POST is the standard way to "create something new" in a REST API.
    # The request body is a JSON object with the list name and description.
    #
    # If everything goes well, the API responds with the new list's details,
    # including a unique ID we can use to add people to it later.
    try:
        response = requests.post(
            f"{PROSPECTOR_URL}/v1/lists",
            json={"name": name, "description": description},
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

    # HTTP status codes tell us whether the request succeeded.
    # 2xx = success, 4xx = something was wrong with our request.
    # 401 means the server did not recognise our API key.
    if response.status_code == 401:
        print("Error: Invalid API key.")
        print("Make sure LEADIQ_API_KEY in your .env file is correct.")
        sys.exit(1)
    # 409 Conflict means a list with this name already exists.
    # LeadIQ does not allow two lists with the same name.
    if response.status_code == 409:
        print(f'Error: A list named "{name}" already exists.')
        print("Rename it in LeadIQ or change LIST_NAME in this script.")
        sys.exit(1)
    if not response.ok:
        print(f"Error {response.status_code}: {result.get('message', 'Unknown error')}")
        sys.exit(1)

    return result

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # Make sure the API key was loaded from the .env file.
    if not API_KEY:
        print("Error: LEADIQ_API_KEY is not set.")
        print("  1. Copy .env.example to .env")
        print("  2. Open .env and paste your Secret Base64 API key")
        sys.exit(1)

    print(f'Creating list "{LIST_NAME}"...', end=" ", flush=True)
    created_list = create_list(LIST_NAME, LIST_DESCRIPTION)
    print("done.")
    print()
    # The API returns the new list's details.  The ID is the most important
    # piece — we save it so the next scripts know which list to work with.
    print(f"  ID         : {created_list['id']}")
    print(f"  Name       : {created_list['name']}")
    print(f"  Created at : {created_list['createdAt']}")

    # Save the full list object to a file so the next scripts can read the ID
    # without us having to copy-paste it manually.
    output_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "output", "prospector_list.json")
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(created_list, f, indent=2)
    print(f"\nSaved to  : {output_path}")


if __name__ == "__main__":
    main()
