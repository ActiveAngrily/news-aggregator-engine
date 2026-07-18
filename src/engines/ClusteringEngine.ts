import { GoogleGenAI } from '@google/genai';
import { ExtractedArticle } from './ExtractionEngine';
import * as crypto from 'crypto';
import { env } from '../config/env';

export interface ArticleCluster {
    id: string;
    themeHeadline: string;
    articles: ExtractedArticle[];
}

export class ClusteringEngine {
    private ai: GoogleGenAI;
    private similarityThreshold: number;

    constructor(options?: { similarityThreshold?: number }) {
        if (!env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        this.similarityThreshold = options?.similarityThreshold ?? 0.80;
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

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${env.GEMINI_API_KEY}`;
            
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

        // 3. LLM Verification (Fail-Safe) & Importance Rating
        const verifiedClusters: ArticleCluster[] = [];
        let verificationRequestCount = 0;

        const multiSourceClusters = clusters.filter(c => new Set(c.map(a => a.publisherId)).size >= 2);
        const singleSourceClusters = clusters.filter(c => new Set(c.map(a => a.publisherId)).size === 1);

        console.log(`[Clustering] Processing ${multiSourceClusters.length} multi-source and ${singleSourceClusters.length} single-source clusters.`);

        // Process Multi-Source Clusters
        for (const cluster of multiSourceClusters) {
            if (verificationRequestCount > 0 && verificationRequestCount % 14 === 0) {
                console.log(`[Clustering] Hit 14 LLM verifications. Sleeping 60s for rate limit...`);
                await sleep(60000);
            }
            verificationRequestCount++;

            console.log(`[Clustering] Verifying multi-source cluster with ${cluster.length} articles...`);
            
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
                await new Promise(r => setTimeout(r, 4500));
                
                const response = await this.ai.models.generateContent({
                    model: 'gemini-3.1-flash-lite',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        temperature: 0.1,
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
                        console.log(`  -> Verified Multi-Source! Theme: ${result.themeHeadline}`);
                    } else {
                        console.log(`  -> Dropped multi-source after LLM filtering (not enough publishers remaining).`);
                    }
                }
            } catch (err) {
                console.error(`[Clustering] LLM Verification failed for a cluster:`, err);
            }
        }

        // Process Single-Source Clusters (Batch Rating)
        const singleSourceBatchSize = 20;
        for (let i = 0; i < singleSourceClusters.length; i += singleSourceBatchSize) {
            if (verificationRequestCount > 0 && verificationRequestCount % 14 === 0) {
                console.log(`[Clustering] Hit 14 LLM verifications. Sleeping 60s for rate limit...`);
                await sleep(60000);
            }
            verificationRequestCount++;

            const batch = singleSourceClusters.slice(i, i + singleSourceBatchSize);
            console.log(`[Clustering] Rating importance for single-source batch of ${batch.length} clusters...`);

            // Attach a temporary numeric ID for the batch mapping
            const batchMapping = batch.map((c, index) => ({ tempId: index, cluster: c, title: c[0].title }));

            const prompt = `
You are a senior news editor. Evaluate the global or national importance of the following news headlines.
Rate each headline on a scale of 1 to 10, where:
- 1-3: Trivial, local, or niche news (e.g. minor sports updates, celebrity gossip, local crime)
- 4-5: Moderate importance (e.g. routine political announcements, standard business news)
- 6-8: High importance (e.g. major policy changes, significant economic events, major tech breakthroughs)
- 9-10: Critical global/national news (e.g. wars, major disasters, historic elections)

Here are the headlines:
${batchMapping.map(m => `ID: ${m.tempId} | Headline: ${m.title}`).join('\n')}

Reply ONLY with a JSON array of objects, strictly following this schema, with no other text:
[
  { "id": 0, "rating": 8 },
  { "id": 1, "rating": 4 }
]
`;

            try {
                await new Promise(r => setTimeout(r, 4500));
                
                const response = await this.ai.models.generateContent({
                    model: 'gemini-3.1-flash-lite',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        temperature: 0.1,
                    }
                });

                const text = response.text || '';
                const results = JSON.parse(text);

                if (Array.isArray(results)) {
                    for (const result of results) {
                        if (result.rating >= 6) {
                            const matched = batchMapping.find(m => m.tempId === result.id);
                            if (matched) {
                                verifiedClusters.push({
                                    id: crypto.randomUUID(),
                                    themeHeadline: matched.title, // Use original title as theme for single-source
                                    articles: matched.cluster
                                });
                                console.log(`  -> Verified Single-Source (Rating: ${result.rating})! Theme: ${matched.title}`);
                            }
                        } else {
                            console.log(`  -> Dropped Single-Source (Rating: ${result.rating}): ${batchMapping.find(m => m.tempId === result.id)?.title}`);
                        }
                    }
                }
            } catch (err) {
                console.error(`[Clustering] LLM Rating failed for a single-source batch:`, err);
            }
        }

        console.log(`[Clustering] Final verified clusters: ${verifiedClusters.length}`);
        return verifiedClusters;
    }
}
