import { DiscoveryEngine } from './engines/DiscoveryEngine';
import { ExtractionEngine, ExtractedArticle } from './engines/ExtractionEngine';
import { ClusteringEngine, ArticleCluster } from './engines/ClusteringEngine';
import { BrowserService } from './services/BrowserService';
import * as fs from 'fs';
import * as path from 'path';

interface PayloadConfig {
    publishers: any[];
    aiWriters?: any[];
    parameters?: {
        similarityThreshold?: number;
        maxUrlsPerPublisher?: number;
        collectionId?: string;
    };
    returnWebhookUrl: string;
    authKey: string;
}

function loadConfig(): PayloadConfig {
    const args = process.argv.slice(2);
    const configArgIndex = args.indexOf('--config');
    if (configArgIndex === -1 || configArgIndex + 1 >= args.length) {
        throw new Error("Missing --config argument. Usage: node index.js --config payload.json");
    }
    
    const configPath = path.resolve(args[configArgIndex + 1]);
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent) as PayloadConfig;
}



async function runGatherPipeline() {
    console.log('Starting Programmable Red Letter Engine (Gather Phase)...');
    
    let config: PayloadConfig;
    try {
        config = loadConfig();
    } catch (err: any) {
        console.error("Failed to load configuration:", err.message);
        process.exit(1);
    }

    const discoveryEngine = new DiscoveryEngine();
    const extractionEngine = new ExtractionEngine();
    const allExtractedArticles: ExtractedArticle[] = [];
    const maxUrls = config.parameters?.maxUrlsPerPublisher ?? 75;

    try {
        // Phase 1: Scraping
        for (const publisher of config.publishers) {
            console.log(`\n--- Processing Publisher: ${publisher.name} ---`);
            const discoveredUrls = await discoveryEngine.discoverArticles(publisher);
            
            // Limit to max URLs per publisher for performance
            const targetUrls = discoveredUrls.slice(0, maxUrls);
            
            for (let i = 0; i < targetUrls.length; i++) {
                const url = targetUrls[i];
                console.log(`[${publisher.name}] (${i+1}/${targetUrls.length}) Extracting: ${url}`);
                const article = await extractionEngine.extractContent(url, publisher);
                
                if (article) {
                    allExtractedArticles.push(article);
                }
            }
        }

        console.log(`Successfully scraped ${allExtractedArticles.length} total articles.`);
        
        // Phase 2: Clustering
        const clusteringEngine = new ClusteringEngine({ 
            similarityThreshold: config.parameters?.similarityThreshold 
        });
        
        const verifiedClusters = await clusteringEngine.clusterArticles(allExtractedArticles);
        
        // Phase 2.5: Synthesis
        let finalPayloadData = null;
        if (config.aiWriters && config.aiWriters.length > 0) {
            const { SynthesisEngine } = require('./engines/SynthesisEngine');
            const synthesisEngine = new SynthesisEngine(config.aiWriters);
            const finalArticles = [];
            for (const cluster of verifiedClusters) {
                const article = await synthesisEngine.synthesize(cluster);
                if (article) finalArticles.push(article);
            }
            finalPayloadData = { status: 'success', articles: finalArticles };
        } else {
            // Fallback for old Commander versions
            finalPayloadData = { status: 'success', clusters: verifiedClusters };
        }
        
        // Phase 3: Save to Appwrite Database
        console.log('Saving synthesized articles to Appwrite database...');
        const { Client, Databases } = require('node-appwrite');
        const { env } = require('./config/env');
        const APPWRITE_ENDPOINT = env.APPWRITE_ENDPOINT;
        const APPWRITE_PROJECT = env.APPWRITE_PROJECT;
        const APPWRITE_API_KEY = env.APPWRITE_API_KEY;
        const DATABASE_ID = env.DATABASE_ID;
        const ARTICLES_COLLECTION_ID = config.parameters?.collectionId || env.ARTICLES_COLLECTION_ID;

        const client = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT)
            .setKey(APPWRITE_API_KEY);
        const databases = new Databases(client);

        let successCount = 0;
        let failCount = 0;
        const finalArticles = finalPayloadData?.articles || [];

        for (const article of finalArticles) {
            try {
                // Determine ID based on URL hash or ID if present
                const articleId = article.id || 'unique()';
                
                await databases.createDocument(
                    DATABASE_ID,
                    ARTICLES_COLLECTION_ID,
                    articleId,
                    {
                        title: article.title,
                        summary: article.summary,
                        markdownContent: article.content,
                        category: article.category,
                        author: article.authorAlias || article.author || 'AI Editor',
                        sources: article.sources || article.urls || [],
                        imageUrl: article.imageUrl || null
                    }
                );
                successCount++;
                console.log(`Saved: ${article.title}`);
            } catch (err: any) {
                if (err.code === 409) {
                    console.log(`Skipped (Already Exists): ${article.title}`);
                } else {
                    failCount++;
                    console.error(`Error saving ${article.title}:`, err.message);
                }
            }
        }
        console.log(`Appwrite Upload Complete! Success: ${successCount}, Failed: ${failCount}`);

        // Dump to file if needed for debugging
        fs.writeFileSync('output.json', JSON.stringify(finalPayloadData, null, 2));

        console.log(`\nGather Pipeline Completed Successfully!`);

    } catch (error) {
        console.error('Gather Pipeline Failed:', error);
        

        process.exit(1);

    } finally {
        await BrowserService.getInstance().close();
    }
}

runGatherPipeline();
