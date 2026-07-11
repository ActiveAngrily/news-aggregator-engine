# Red Letter AI: Project Handoff Document

**To the AI Agent reading this:** You are taking over development on the **Frontend (Commander)** of the Red Letter AI project. The backend worker engine is already fully built and deployed. Read this document to instantly sync on the architecture and your next tasks.

---

## 1. The Architecture (Commander-Worker Model)
To solve severe serverless timeout limitations (Vercel has a 10-60s timeout, and LLM synthesis takes up to 20 minutes), the project has been split into two parts:

*   **Project A (The Worker):** `news-aggregator-engine`. This is a stateless Node.js service running on GitHub Actions. It handles all web scraping (using Playwright stealth) and mathematical clustering (Gemini embeddings + Cosine Similarity). **This part is completely finished.**
*   **Project B (The Commander):** `red-letter` (Next.js frontend). This is where you are working now. Your job is to orchestrate the worker and display the final synthesized news.

## 2. How to Control the Worker
The `news-aggregator-engine` is a completely "blind" API. It has no hardcoded publishers or databases. You must trigger it using a GitHub `repository_dispatch` webhook.

To tell the worker to start gathering news, your Next.js app needs to send this `POST` request:

```bash
curl -X POST https://api.github.com/repos/ActiveAngrily/news-aggregator-engine/dispatches \
-H "Accept: application/vnd.github.v3+json" \
-H "Authorization: token YOUR_GITHUB_PAT" \
-d '{
  "event_type": "start-gathering",
  "client_payload": {
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
    "returnWebhookUrl": "https://YOUR_NEXTJS_APP.com/api/webhooks/worker-results",
    "authKey": "STATIC_SECRET_KEY"
  }
}'
```

## 3. How the Worker Responds
Once the GitHub Action finishes scraping and clustering, it will `POST` the final, massive JSON array of mathematically clustered news articles directly to the `returnWebhookUrl` you provided in the payload. It will authenticate itself using `Authorization: Bearer STATIC_SECRET_KEY`.

## 4. Your Next Tasks in `red-letter`
1.  **Build the Trigger:** Create the cron job or UI button in the Next.js app that actually formats the JSON payload (with the list of publishers) and sends the `POST` request to the GitHub API.
2.  **Build the Webhook Receiver:** Create the API route (e.g., `app/api/webhooks/worker-results/route.ts`) to receive the huge POST request from the worker.
3.  **Synthesis & Database:** Once your API route receives the clustered data, pass it into an LLM for final synthesis, and then save it to the Appwrite database so the frontend can display it.

*End of Handoff.*
