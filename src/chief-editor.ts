import { Client, Databases, Query } from 'node-appwrite';
import { ChiefEditorEngine } from './engines/ChiefEditorEngine';
import * as dotenv from 'dotenv';
dotenv.config();

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT || '6a4aa5bd002851ccd0c8';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY as string;
const DATABASE_ID = process.env.DATABASE_ID || 'news_aggregator_db';
const ARTICLES_COLLECTION_ID = process.env.ARTICLES_COLLECTION_ID || 'articles';
const EDITIONS_COLLECTION_ID = process.env.EDITIONS_COLLECTION_ID || 'editions';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;

async function runChiefEditor() {
    const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT)
        .setKey(APPWRITE_API_KEY);

    const databases = new Databases(client);

    console.log('Fetching articles for the day...');
    let articles: any[] = [];
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            ARTICLES_COLLECTION_ID,
            [
                Query.orderDesc('$createdAt'),
                Query.limit(50)
            ]
        );
        articles = response.documents;
        console.log(`Fetched ${articles.length} articles.`);
    } catch (error) {
        console.error('Failed to fetch articles:', error);
        return;
    }

    if (articles.length === 0) {
        console.log('No articles found to layout.');
        return;
    }
    
    console.log('Generating layout with ChiefEditorEngine...');
    const editor = new ChiefEditorEngine(GEMINI_API_KEY);
    const layout = await editor.generateLayout(articles);

    if (!layout) {
        console.error('ChiefEditorEngine failed to generate a layout.');
        return;
    }

    console.log('Saving layout to Appwrite editions collection...');
    try {
        const editionDoc = await databases.createDocument(
            DATABASE_ID,
            EDITIONS_COLLECTION_ID,
            'unique()',
            {
                publishedAt: new Date().toISOString(),
                layoutData: JSON.stringify(layout),
                editionNumber: Math.floor(Date.now() / 1000),
                isActive: true
            }
        );
        console.log('Edition saved successfully:', editionDoc.$id);
    } catch (error) {
        console.error('Failed to save edition. Ensure editions collection exists with string attributes `date` and `layout`. Error:', error);
    }
}

runChiefEditor();
