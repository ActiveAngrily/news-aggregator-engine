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

        console.log("Fetching edition...");
        const response = await databases.listDocuments(
            process.env.DATABASE_ID!,
            'editions_staging',
            [
                Query.equal('isActive', true),
                Query.orderDesc('$createdAt'),
                Query.limit(1)
            ]
        );
        console.log("Success! Got", response.documents.length);
        if (response.documents.length > 0) {
            console.log("Doc id:", response.documents[0].$id);
        }
    } catch (e) {
        console.error("FAILED:", e.message);
    }
}
run();
