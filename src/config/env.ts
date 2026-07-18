import * as dotenv from 'dotenv';
dotenv.config();

export const env = {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
    APPWRITE_PROJECT: process.env.APPWRITE_PROJECT || '6a4aa5bd002851ccd0c8',
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY as string,
    DATABASE_ID: process.env.DATABASE_ID || 'news_aggregator_db',
    ARTICLES_COLLECTION_ID: process.env.ARTICLES_COLLECTION_ID || 'articles',
    EDITIONS_COLLECTION_ID: process.env.EDITIONS_COLLECTION_ID || 'editions',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY as string
};
