import { GoogleGenAI } from '@google/genai';
import { ExtractedArticle } from './ExtractionEngine';
import * as crypto from 'crypto';

export interface ArticleCluster {
    id: string;
    themeHeadline: string;
    articles: ExtractedArticle[];
}

export class ClusteringEngine {
    private ai: GoogleGenAI;
    private similarityThreshold = 0.80;

    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    // Helper: Compute cosine similarity between two vectors
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) throw new Error('Vectors must be of same length');
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public async clusterArticles(articles: ExtractedArticle[]): Promise<ArticleCluster[]> {
        if (articles.length === 0) return [];

        console.log(`[Clustering] Vectorizing ${articles.length} articles using gemini-embedding-2...`);
        
        // 1. Vectorize all titles using REST batchEmbedContents (bypasses RPM limit)
        const embeddings: number[][] = [];
        
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        
        const batchSize = 90;
        for (let i = 0; i < articles.length; i += batchSize) {
            if (i > 0) {
                console.log(`[Clustering] Hit ${batchSize} embedding requests. Sleeping 60s for RPM rate limit...`);
                await sleep(60000);
            }

            const batchArticles = articles.slice(i, i + batchSize);
            const requests = batchArticles.map(article => ({
                model: "models/gemini-embedding-2",
                content: {
                    parts: [{ text: article.title + "\n\n" + article.content.substring(0, 1500) }]
                }
            }));

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`;
            
            console.log(`[Clustering] Batch embedding ${batchArticles.length} articles (${i + 1} to ${Math.min(i + batchSize, articles.length)})...`);
            
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requests })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Batch embed failed with status ${res.status}: ${errText}`);
                }

                const data = await res.json();
                
                if (data && data.embeddings && Array.isArray(data.embeddings)) {
                    for (const emb of data.embeddings) {
                        embeddings.push(emb.values);
                    }
                } else {
                    throw new Error("Invalid response format from batchEmbedContents");
                }
            } catch (err: any) {
                console.error(`[Clustering] Error batch embedding starting at index ${i}:`, err.message);
                throw err;
            }
        }

        if (embeddings.length !== articles.length || embeddings.some(e => !e)) {
            throw new Error("Failed to get embeddings for all articles");
        }

        const vectors = embeddings;
        
        // 2. Compute similarity matrix and group
        const clusters: ExtractedArticle[][] = [];
        const assigned = new Set<number>();

        for (let i = 0; i < articles.length; i++) {
            if (assigned.has(i)) continue;

            const currentCluster = [articles[i]];
            assigned.add(i);

            for (let j = i + 1; j < articles.length; j++) {
                if (assigned.has(j)) continue;

                const similarity = this.cosineSimilarity(vectors[i], vectors[j]);
                if (similarity > this.similarityThreshold) {
                    currentCluster.push(articles[j]);
                    assigned.add(j);
                }
            }
            clusters.push(currentCluster);
        }

        console.log(`[Clustering] Mathematically formed ${clusters.length} provisional clusters.`);

        // 3. LLM Verification (Fail-Safe)
        const verifiedClusters: ArticleCluster[] = [];
        let verificationRequestCount = 0;

        for (const cluster of clusters) {
            // Must have at least 2 distinct publishers
            const publisherSet = new Set(cluster.map(a => a.publisherId));
            if (publisherSet.size < 2) {
                console.log(`[Clustering] Dropped cluster (only ${publisherSet.size} publishers). Headline: ${cluster[0].title}`);
                continue;
            }

            if (verificationRequestCount > 0 && verificationRequestCount % 14 === 0) {
                console.log(`[Clustering] Hit 14 LLM verifications. Sleeping 60s for rate limit...`);
                await sleep(60000);
            }
            verificationRequestCount++;

            console.log(`[Clustering] Verifying cluster with ${cluster.length} articles...`);
            
            const prompt = `
You are a strict news editor. Below is a list of article headlines and URLs.
Do all of these headlines refer to the exact same specific news event?
If some are outliers (e.g. they refer to a different event, even if mathematically similar), exclude their URLs.
Provide a unified, objective "themeHeadline" that summarizes the exact event.

Articles:
${cluster.map(a => `- [${a.url}] ${a.title}`).join('\n')}

Reply ONLY with a JSON object in this exact format, with no markdown formatting or backticks:
{
  "themeHeadline": "A perfectly neutral, objective summary of the event",
  "validUrls": ["url1", "url2"]
}
`;
            
            try {
                // Sleep for 4.5 seconds to respect the 15 RPM limit of gemini-3.1-flash-lite
                await new Promise(r => setTimeout(r, 4500));
                
                const response = await this.ai.models.generateContent({
                    model: 'gemini-3.1-flash-lite',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        temperature: 0.1, // Keep it highly objective and deterministic
                    }
                });

                const text = response.text || '';
                const result = JSON.parse(text);

                if (result && result.validUrls && result.themeHeadline) {
                    const validArticles = cluster.filter(a => result.validUrls.includes(a.url));
                    const finalPublisherSet = new Set(validArticles.map(a => a.publisherId));

                    if (finalPublisherSet.size >= 2) {
                        verifiedClusters.push({
                            id: crypto.randomUUID(),
                            themeHeadline: result.themeHeadline,
                            articles: validArticles
                        });
                        console.log(`  -> Verified! Theme: ${result.themeHeadline}`);
                    } else {
                        console.log(`  -> Dropped after LLM filtering (not enough publishers remaining).`);
                    }
                }
            } catch (err) {
                console.error(`[Clustering] LLM Verification failed for a cluster:`, err);
            }
        }

        console.log(`[Clustering] Final verified clusters: ${verifiedClusters.length}`);
        return verifiedClusters;
    }
}
