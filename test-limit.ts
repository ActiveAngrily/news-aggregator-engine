import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const client = new Client()
            .setEndpoint(process.env.APPWRITE_ENDPOINT!)
            .setProject(process.env.APPWRITE_PROJECT!)
            .setKey(process.env.APPWRITE_API_KEY!);
        const databases = new Databases(client);

        console.log("Querying with limit 200...");
        const response = await databases.listDocuments(
            process.env.DATABASE_ID!,
            'articles_staging',
            [
                Query.orderDesc('$createdAt'),
                Query.limit(200)
            ]
        );
        console.log("Success! Got", response.documents.length);
    } catch (e) {
        console.error("FAILED:", e.message);
    }
}
run();
