import { DiscoveryEngine } from './engines/DiscoveryEngine';
import { ExtractionEngine, ExtractedArticle } from './engines/ExtractionEngine';
import { ClusteringEngine, ArticleCluster } from './engines/ClusteringEngine';
import { publishers } from './config/publishers';
import { BrowserService } from './services/BrowserService';
import { Client, Databases, ID } from 'node-appwrite';
import * as crypto from 'crypto';

async function triggerFrontendSynthesis() {
    const githubToken = process.env.GITHUB_PAT;
    const githubRepo = 'ActiveAngrily/red-letter';
    
    if (!githubToken) {
        console.warn('GITHUB_PAT is not set. Skipping webhook trigger to red-letter.');
        return;
    }

    console.log(`[Webhook] Triggering synthesis pipeline in ${githubRepo}...`);
    try {
        const response = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: 'start-synthesis',
                client_payload: { message: 'Gathering phase complete' }
            })
        });

        if (response.ok) {
            console.log('[Webhook] Successfully triggered Project B synthesis action!');
        } else {
            console.error('[Webhook] Failed to trigger Project B action:', await response.text());
        }
    } catch (error) {
        console.error('[Webhook] Error sending webhook:', error);
    }
}

async function runGatherPipeline() {
    console.log('Starting Red Letter Engine (Gather Phase)...');
    
    const discoveryEngine = new DiscoveryEngine();
    const extractionEngine = new ExtractionEngine();
    const allExtractedArticles: ExtractedArticle[] = [];

    try {
        // Phase 1: Scraping
        for (const publisher of publishers) {
            console.log(`\n--- Processing Publisher: ${publisher.name} ---`);
            const discoveredUrls = await discoveryEngine.discoverArticles(publisher);
            
            // Limit to 75 URLs per publisher for performance
            const targetUrls = discoveredUrls.slice(0, 75);
            
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
        const clusteringEngine = new ClusteringEngine();
        const verifiedClusters = await clusteringEngine.clusterArticles(allExtractedArticles);
        
        // Phase 3: Push to Appwrite
        console.log('\n[Appwrite] Saving clusters to database...');
        
        const client = new Client()
            .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
            .setProject(process.env.APPWRITE_PROJECT_ID!)
            .setKey(process.env.APPWRITE_API_KEY!);

        const databases = new Databases(client);
        const dbId = process.env.APPWRITE_DATABASE_ID!;
        const rawClustersCollectionId = process.env.APPWRITE_RAW_CLUSTERS_COLLECTION_ID!;

        let savedCount = 0;
        for (const cluster of verifiedClusters) {
            try {
                await databases.createDocument(
                    dbId,
                    rawClustersCollectionId,
                    ID.unique(),
                    {
                        clusterId: cluster.id,
                        themeHeadline: cluster.themeHeadline,
                        // Serialize the articles array to a JSON string because Appwrite limits array depths
                        articlesJson: JSON.stringify(cluster.articles),
                        status: 'pending' // So Project B knows what to process
                    }
                );
                savedCount++;
            } catch (err) {
                console.error(`Failed to save cluster ${cluster.themeHeadline}:`, err);
            }
        }
        
        console.log(`[Appwrite] Successfully saved ${savedCount} clusters.`);

        // Phase 4: Trigger Project B (red-letter)
        await triggerFrontendSynthesis();

        console.log(`\nGather Pipeline Completed Successfully!`);

    } catch (error) {
        console.error('Gather Pipeline Failed:', error);
    } finally {
        await BrowserService.getInstance().close();
    }
}

runGatherPipeline();
