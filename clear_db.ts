import { Client, Databases } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config();

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT || '6a4aa5bd002851ccd0c8';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY as string;
const DATABASE_ID = process.env.DATABASE_ID || 'news_aggregator_db';
const ARTICLES_COLLECTION_ID = process.env.ARTICLES_COLLECTION_ID || 'articles';
const EDITIONS_COLLECTION_ID = process.env.EDITIONS_COLLECTION_ID || 'editions';

if (!APPWRITE_API_KEY) {
    console.error("Missing APPWRITE_API_KEY. Set it in .env");
    process.exit(1);
}

const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);

async function clearCollection(collectionId: string) {
    console.log(`Clearing collection: ${collectionId}`);
    let deletedCount = 0;
    
    while (true) {
        try {
            const response = await databases.listDocuments(DATABASE_ID, collectionId, []);
            if (response.documents.length === 0) {
                break;
            }
            
            for (const doc of response.documents) {
                await databases.deleteDocument(DATABASE_ID, collectionId, doc.$id);
                deletedCount++;
                if (deletedCount % 10 === 0) console.log(`Deleted ${deletedCount} documents...`);
            }
        } catch (error) {
            console.error(`Error clearing ${collectionId}:`, error);
            break;
        }
    }
    console.log(`Finished clearing ${collectionId}. Total deleted: ${deletedCount}`);
}

async function run() {
    await clearCollection(ARTICLES_COLLECTION_ID);
    await clearCollection(EDITIONS_COLLECTION_ID);
    console.log("Database cleared successfully.");
}

run();
