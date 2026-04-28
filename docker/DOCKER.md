# Running with Docker

If you are comfortable with Docker, you can run the samples without installing Python or Node.js locally.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Your **Secret Base64 API key** from LeadIQ under **Settings → API Keys**

---

## Setup

**1. Create your environment file**

For Python samples, from the repo root:

```bash
cp python/.env.example python/.env
```

For TypeScript samples:

```bash
cp typescript/.env.example typescript/.env
```

Open the `.env` file(s) and add your API key:

```
LEADIQ_API_KEY=ABCdef123...
```

**2. Build the images**

From the `docker/` directory:

```bash
docker compose build
```

This builds both the Python and TypeScript images. To build only one:

```bash
docker compose build leadiq-python    # Python only
docker compose build leadiq-ts        # TypeScript only
```

---

## Running a sample

### Python

From the `docker/` directory:

```bash
docker compose run --rm leadiq-python python graphql/01_check_usage.py
docker compose run --rm leadiq-python python graphql/02_advanced_search.py
docker compose run --rm leadiq-python python graphql/03_enrich_profiles.py
```

### TypeScript

```bash
docker compose run --rm leadiq-ts npx ts-node graphql/01_check_usage.ts
docker compose run --rm leadiq-ts npx ts-node graphql/02_advanced_search.ts
docker compose run --rm leadiq-ts npx ts-node graphql/03_enrich_profiles.ts
```

---

## Notes

- The `--rm` flag removes the container after it finishes — no cleanup needed.
- Your `.env` file is loaded automatically by the Compose config.
- The source directories (`python/` and `typescript/`) are mounted as volumes, so any changes you make to the scripts are reflected immediately without rebuilding the image.
- For the TypeScript service, `node_modules` is kept inside the container and is not affected by the volume mount — so you do not need to run `npm install` locally.
