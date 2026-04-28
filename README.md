# LeadIQ API Samples

Ready-to-run code samples showing how to use the LeadIQ API. Each language folder is self-contained — pick the one that fits your setup and follow its README.

---

## Languages

| Folder | Language | Requirements |
|--------|----------|--------------|
| [`bash/`](bash/README.md) | Bash | `curl` (pre-installed on most systems) |
| [`python/`](python/README.md) | Python | Python 3.10+ |
| [`typescript/`](typescript/README.md) | TypeScript | Node.js 24+ |

Each folder contains three scripts that build on each other:

| # | Script | What it does | Credits |
|---|--------|-------------|---------|
| 01 | `check_usage` | Verify your API key and view your credit balance | None |
| 02 | `advanced_search` | Search for people by role, seniority, and location | 1 per page |
| 03 | `enrich_profiles` | Enrich each person with their work email and direct phone | 1 per person |

---

## API key

All samples authenticate with a **Secret Base64 API key**. Find yours in LeadIQ under **Settings → API Keys**.

- **Python / TypeScript** — add the key to a `.env` file (see the folder README)
- **Bash** — export it in your terminal: `export LEADIQ_API_KEY=your_key`

---

## API overview

- **GraphQL API** — `https://api.leadiq.com/graphql` — used by all samples
- **REST API** — `https://prospector.leadiq.com` — additional prospecting endpoints

---

## Docker

Prefer not to install anything locally? A Docker setup in [`_docker/`](_docker/DOCKER.md) covers all three languages. You only need Docker Desktop.

---

## Questions or issues?

Contact the LeadIQ API team at [api@leadiq.com](mailto:api@leadiq.com).
