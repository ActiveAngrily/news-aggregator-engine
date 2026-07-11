<!-- prettier-ignore -->
<div align="center">

# News Aggregator Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white)](https://github.com/features/actions)

[Overview](#overview) • [Architecture](#architecture) • [Usage](#usage) • [Environment Variables](#environment-variables)

</div>

## Overview

**news-aggregator-engine** is the stateless background worker for Red Letter AI. Operating on a headless Node.js architecture via GitHub Actions, it autonomously scrapes major news networks, bypasses bot-protections using Playwright stealth, and uses cosine similarity math on Gemini embeddings to perfectly cluster identical news events.

## Architecture

This repository operates as a **Stateless, Programmable API Service**. 

Instead of running on a hardcoded schedule with hardcoded publishers, it waits for a `repository_dispatch` webhook containing a JSON payload. This payload perfectly defines the job, the targets, and where to send the final clustered data.

## Usage

### 1. Triggering the Engine

The Commander (`red-letter` frontend) sends a `POST` request to the GitHub API to trigger the workflow:

```bash
curl -X POST https://api.github.com/repos/ActiveAngrily/news-aggregator-engine/dispatches \
-H "Accept: application/vnd.github.v3+json" \
-H "Authorization: token YOUR_GITHUB_PAT" \
-d '{"event_type": "start-gathering", "client_payload": { ... }}'
```

### 2. The Configuration Payload

Inside the `client_payload`, you define exactly what you want the engine to do. The engine is entirely blind and relies purely on this payload for instructions:

```json
{
  "publishers": [
    {
      "id": "cnn",
      "name": "CNN",
      "entryPoints": ["https://edition.cnn.com/world"],
      "selectors": { 
          "articleLink": "a[href*=\"/202\"]", 
          "title": "h1", 
          "mainContent": ".article__content", 
          "paragraphs": "p.paragraph" 
      }
    }
  ],
  "parameters": {
    "similarityThreshold": 0.80,
    "maxUrlsPerPublisher": 75
  },
  "returnWebhookUrl": "https://red-letter.com/api/webhooks/worker-results",
  "authKey": "STATIC_SECRET_KEY"
}
```

### 3. Execution & Webhook Return

1. GitHub Actions automatically spins up a high-compute runner and installs headless Chromium.
2. The engine parses your payload dynamically (`npx ts-node src/index.ts --config payload.json`).
3. The **DiscoveryEngine** and **ExtractionEngine** scrape the targeted entry points using `playwright-extra` and `puppeteer-extra-plugin-stealth`.
4. The **ClusteringEngine** mathematically groups the stories using Cosine Similarity and verifies them using `gemini-3.1-flash-lite`.
5. Finally, the engine `POST`s the structured JSON data directly to your `returnWebhookUrl` authenticated via a Bearer token (`authKey`).

## Environment Variables

To run this pipeline locally or in CI, the following environment variables are required:

- `GEMINI_API_KEY`: Required for generating text embeddings and clustering verification.

> [!NOTE]
> The GitHub PAT is used by the frontend to trigger this repo via `repository_dispatch`, and is not needed by this repo itself.
