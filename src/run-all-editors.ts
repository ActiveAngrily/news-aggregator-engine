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

const FRONTPAGE_TEMPLATE = [
    { id: 'block-hero', type: 'HERO_PACKAGE', colSpan: 12, maxArticles: 6 },
    { id: 'block-top-briefing', type: 'BRIEFING_STACK', sectionTitle: 'Daily Briefing', colSpan: 8, maxArticles: 4 },
    { id: 'block-top-opinion', type: 'OPINION_COLUMN', sectionTitle: 'Opinion & Analysis', colSpan: 4, maxArticles: 3 },
    { id: 'block-feature-grid', type: 'FEATURE_GRID', sectionTitle: 'Features', colSpan: 12, maxArticles: 4 },
    { id: 'block-secondary-briefing', type: 'BRIEFING_STACK', sectionTitle: 'More News', colSpan: 8, maxArticles: 4 },
    { id: 'block-more-news', type: 'COMPACT_STACK', sectionTitle: 'Latest Hits', colSpan: 4, maxArticles: 5 },
    { id: 'block-politics', type: 'DOUBLE_BRIEFING_STACK', sectionTitle: 'Politics & Policy', colSpan: 8, rowSpan: 2, maxArticles: 6 },
    { id: 'block-business-opinion', type: 'OPINION_COLUMN', sectionTitle: 'Business Insights', colSpan: 4, rowSpan: 1, maxArticles: 3 },
    { id: 'block-politics-compact', type: 'COMPACT_STACK', sectionTitle: 'More in Politics', colSpan: 4, rowSpan: 1, maxArticles: 4 },
    { id: 'block-double-feature', type: 'DOUBLE_FEATURE_GRID', sectionTitle: 'In-Depth', colSpan: 12, maxArticles: 6 },
    { id: 'block-world-news', type: 'DOUBLE_BRIEFING_STACK', sectionTitle: 'World News', colSpan: 8, rowSpan: 2, maxArticles: 6 },
    { id: 'block-tech-compact', type: 'COMPACT_STACK', sectionTitle: 'Technology', colSpan: 4, rowSpan: 1, maxArticles: 5 },
    { id: 'block-science-compact', type: 'COMPACT_STACK', sectionTitle: 'Science', colSpan: 4, rowSpan: 1, maxArticles: 4 }
];

const CATEGORY_TEMPLATE = [
    { id: 'cat-hero', type: 'HERO_PACKAGE', colSpan: 12, maxArticles: 6 },
    { id: 'cat-top-briefing', type: 'BRIEFING_STACK', sectionTitle: 'Top Stories', colSpan: 8, maxArticles: 4 },
    { id: 'cat-opinion', type: 'OPINION_COLUMN', sectionTitle: 'Analysis', colSpan: 4, maxArticles: 3 },
    { id: 'cat-feature', type: 'FEATURE_GRID', sectionTitle: 'Features', colSpan: 12, maxArticles: 4 },
    { id: 'cat-secondary-briefing', type: 'DOUBLE_BRIEFING_STACK', sectionTitle: 'More News', colSpan: 8, rowSpan: 2, maxArticles: 6 },
    { id: 'cat-compact', type: 'COMPACT_STACK', sectionTitle: 'Latest Hits', colSpan: 4, rowSpan: 1, maxArticles: 5 },
    { id: 'cat-compact-2', type: 'COMPACT_STACK', sectionTitle: 'More Hits', colSpan: 4, rowSpan: 1, maxArticles: 4 }
];

const PROMPTS = {
    frontpage: `You are the Chief Editor of a major digital newspaper. Your job is to take the day's synthesized articles and place them into the slots of our fixed frontpage layout template.
Rules: Place most important stories in "block-hero", organically group related articles.`,
    
    tech: `You are the Tech Editor of a major digital newspaper (e.g. NYT Technology, The Verge). Your goal is to lay out the technology section using our fixed template.
Editorial Philosophy:
1. "cat-hero": Prioritize high-stakes, macro-level news over standard consumer product releases. Lead with AI regulation, corporate lawsuits, big tech accountability, and industry-shifting events.
2. "cat-opinion": Highlight podcasts, newsletters, opinion columns, and deep conversations around tech's societal impact.
3. "cat-feature": Focus on consumer utility—personal technology, hardware reviews, actionable "How-To" journalism, and lifestyle tech.
4. Other slots: Use for a fast-paced breaking news feed on earnings reports, minor product launches, and daily industry shifts.
Place the best articles in the designated slots.`,
    
    business: `You are the Business Editor of a major digital newspaper (e.g. WSJ, NYT Business). Your goal is to lay out the business section using our fixed template.
Editorial Philosophy:
1. "cat-hero": The focal point. Use it for the most important stories of the day with high-impact journalism (e.g. major policy impacts, corporate strategy).
2. "cat-top-briefing": Group immediate, market-moving data, earnings reports, and breaking corporate news.
3. "cat-feature" & "cat-opinion": Deeper thematic pieces, deal-making analysis, personal finance insights, and thematic features.
Organize the complex web of markets, tech, and the economy into these easily digestible buckets.`,
    
    india: `You are the India Editor of a major digital newspaper (e.g. Times of India, The Hindu). Your goal is to lay out the national news section using our fixed template.
Editorial Philosophy:
1. "cat-hero": Dedicate this space to 1-3 major national stories to set the daily agenda. Focus on hard politics or massive national events.
2. "cat-top-briefing": Treat this as a high-velocity, fast-paced breaking news ticker. Fill it with immediate updates, political maneuvers, and urgent developments.
3. "cat-opinion" & "cat-feature": Curated digests and regional connections. Acknowledge that national interest often intersects with local relevance.
Mix hard politics, regional issues, and human interest stories to capture a dense, fast-paced national happening.`,

    generic: `You are the Category Editor of a major digital newspaper. Your goal is to lay out this category's section using our fixed template.
Rules: Place the most important stories in "cat-hero", and organize the rest logically.`
};

async function runAllEditors() {
    const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT)
        .setKey(APPWRITE_API_KEY);

    const databases = new Databases(client);
    
    console.log('Fetching articles for the day...');
    let allArticles: any[] = [];
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            ARTICLES_COLLECTION_ID,
            [
                Query.orderDesc('$createdAt'),
                Query.limit(200)
            ]
        );
        allArticles = response.documents;
        console.log(`Fetched ${allArticles.length} articles.`);
    } catch (error) {
        console.error('Failed to fetch articles:', error);
        return;
    }

    if (allArticles.length === 0) {
        console.log('No articles found to layout.');
        return;
    }

    const categories = {
        frontpage: allArticles,
        tech: allArticles.filter(a => a.category === 'Technology & Science'),
        business: allArticles.filter(a => a.category === 'Business & Economy'),
        india: allArticles.filter(a => a.category === 'India'),
        politics: allArticles.filter(a => a.category === 'Politics & World')
    };

    const finalLayoutData: Record<string, any> = {};

    for (const [catName, articles] of Object.entries(categories)) {
        if (articles.length === 0) {
            console.log(`Skipping ${catName} because it has 0 articles.`);
            continue;
        }

        console.log(`Generating layout for ${catName} with ${articles.length} articles...`);
        
        const template = catName === 'frontpage' ? FRONTPAGE_TEMPLATE : CATEGORY_TEMPLATE;
        let promptBase = PROMPTS[catName as keyof typeof PROMPTS] || PROMPTS.generic;
        
        const editor = new ChiefEditorEngine(GEMINI_API_KEY, template, promptBase);
        const layout = await editor.generateLayout(articles);
        
        if (layout) {
            finalLayoutData[catName] = layout;
            console.log(`Successfully generated layout for ${catName}`);
        } else {
            console.error(`Failed to generate layout for ${catName}`);
        }
    }

    console.log('Saving bundled layout to Appwrite editions collection...');
    try {
        const editionDoc = await databases.createDocument(
            DATABASE_ID,
            EDITIONS_COLLECTION_ID,
            'unique()',
            {
                publishedAt: new Date().toISOString(),
                layoutData: JSON.stringify(finalLayoutData),
                editionNumber: Math.floor(Date.now() / 1000),
                isActive: true
            }
        );
        console.log('Unified Edition saved successfully:', editionDoc.$id);
    } catch (error) {
        console.error('Failed to save edition. Error:', error);
    }
}

runAllEditors();
