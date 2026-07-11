import { DiscoveryEngine } from './engines/DiscoveryEngine';
import { ExtractionEngine, ExtractedArticle } from './engines/ExtractionEngine';
import { ClusteringEngine, ArticleCluster } from './engines/ClusteringEngine';
import { BrowserService } from './services/BrowserService';
import * as fs from 'fs';
import * as path from 'path';

interface PayloadConfig {
    publishers: any[];
    parameters?: {
        similarityThreshold?: number;
        maxUrlsPerPublisher?: number;
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

async function sendResultsWebhook(webhookUrl: string, authKey: string, clusters: ArticleCluster[]) {
    console.log(`[Webhook] Sending clustered results to ${webhookUrl}...`);
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authKey}`
            },
            body: JSON.stringify({
                status: 'success',
                clusters: clusters
            })
        });

        if (response.ok) {
            console.log('[Webhook] Successfully returned data to Commander!');
        } else {
            console.error('[Webhook] Failed to return data:', await response.text());
        }
    } catch (error) {
        console.error('[Webhook] Error sending webhook:', error);
    }
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
        
        // Phase 3: Webhook Return (replaces Appwrite)
        if (config.returnWebhookUrl && config.authKey) {
            await sendResultsWebhook(config.returnWebhookUrl, config.authKey, verifiedClusters);
        } else {
            console.warn('[Webhook] Missing returnWebhookUrl or authKey in config. Skipping return.');
            // Dump to file if needed for debugging
            fs.writeFileSync('output.json', JSON.stringify(verifiedClusters, null, 2));
            console.log('Dumped output to output.json instead.');
        }

        console.log(`\nGather Pipeline Completed Successfully!`);

    } catch (error) {
        console.error('Gather Pipeline Failed:', error);
        
        // Send failure webhook if possible
        if (config?.returnWebhookUrl && config?.authKey) {
            try {
                await fetch(config.returnWebhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.authKey}`
                    },
                    body: JSON.stringify({
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    })
                });
            } catch (webhookErr) {
                console.error('Also failed to send error webhook:', webhookErr);
            }
        }
        process.exit(1);

    } finally {
        await BrowserService.getInstance().close();
    }
}

runGatherPipeline();
