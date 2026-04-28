# LeadIQ API — Python Samples

Ready-to-run Python scripts that show you how to use the LeadIQ API. No Python installation needed — everything runs inside Docker.

---

## What you will need

- **Docker Desktop** installed and running — [download here](https://www.docker.com/products/docker-desktop/)
- A **LeadIQ account** with API access enabled
- Your **Secret Base64 API key** — find it in LeadIQ under **Settings → API Keys**

---

## Setup (one time)

**1. Clone this repository**

```bash
git clone https://github.com/leadiq/api-samples.git
cd api-samples/python
```

**2. Create your environment file**

```bash
cp .env.example .env
```

**3. Add your API key**

Open the `.env` file in any text editor and replace the placeholder with your real key:

```
LEADIQ_API_KEY=ABCdef123...   ← paste your Secret Base64 key here
```

Save the file. You only need to do this once.

---

## Running the samples

Each sample is a standalone script. Run it with:

```bash
docker compose run --rm leadiq python <path/to/script.py>
```

The first run will take a minute to download and build the Docker image. Subsequent runs are much faster.

---

## Samples

### GraphQL API (`graphql/`)

The GraphQL API endpoint is `https://api.leadiq.com/graphql`. It supports rich queries for people, companies, and account management.

| Script | What it does | Credits used |
|--------|-------------|--------------|
| `graphql/01_check_usage.py` | Verifies your API key and displays your current credit usage | None |

**Example:**

```bash
docker compose run --rm leadiq python graphql/01_check_usage.py
```

Expected output:

```
Connecting to LeadIQ API... done (0.45s)

Subscription status: active

Credit Type             Plan                      Used       Cap  Billing
------------------------------------------------------------------------
Contact (Page)          Starter                      5       500  monthly
Contact (ExactMatch)    Starter                      2       100  monthly
```

---

### REST API (`rest/`)

The REST API endpoint is `https://prospector.leadiq.com`. Samples coming soon.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `LEADIQ_API_KEY is not set` | `.env` file is missing or empty | Follow Setup step 2 and 3 above |
| `Error 401: Invalid or missing API key` | The key in `.env` is wrong | Double-check you copied the **Secret Base64** key from LeadIQ Settings → API Keys |
| `Error 402: Insufficient credits` | Your account has no credits left | Log in to LeadIQ and check your plan |
| `Rate limit hit` | Too many requests in a short time | The script retries automatically with a delay — just wait |

---

## Questions or issues?

Contact the LeadIQ API team at [api@leadiq.com](mailto:api@leadiq.com).
