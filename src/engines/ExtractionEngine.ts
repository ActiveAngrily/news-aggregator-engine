import { BrowserService } from '../services/BrowserService';
import { PublisherConfig } from '../types';
import * as cheerio from 'cheerio';

export interface ExtractedArticle {
    url: string;
    publisherId: string;
    title: string;
    content: string; // the raw concatenated prose
    timestamp?: string;
    imageUrl?: string;
}

export class ExtractionEngine {
    private browserService: BrowserService;

    constructor() {
        this.browserService = BrowserService.getInstance();
    }

    public async extractContent(url: string, publisher: PublisherConfig): Promise<ExtractedArticle | null> {
        console.log(`[${publisher.name}] Extracting content from: ${url}`);
        await this.browserService.initialize();
        const page = await this.browserService.newPage();
        
        try {
            // We use domcontentloaded for speed, as we mostly just need the HTML.
            // Wait slightly for dynamic content if needed, but cheerio will parse the static DOM.
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Grab the full HTML state after client-side hydration
            const html = await page.content();
            const $ = cheerio.load(html);

            // 1. Extract Title
            let title = $(publisher.selectors.title).first().text().trim();
            if (!title) {
                // Fallback to meta tags if selector fails
                title = $('meta[property="og:title"]').attr('content') || $('title').text();
            }

            // 2. Extract Main Content
            let content = '';
            // We specifically find the main container, then find paragraphs inside it.
            // But if selectors.paragraphs is direct, we can just use that.
            const paragraphs = $(publisher.selectors.paragraphs);
            
            paragraphs.each((_, el) => {
                const text = $(el).text().trim();
                // Filter out empty paragraphs or tiny boilerplate strings
                if (text.length > 20) {
                    content += text + '\n\n';
                }
            });
            content = content.trim();

            if (!content || content.length < 200) {
                console.warn(`[${publisher.name}] Warning: Low content extracted from ${url}.`);
                return null;
            }

            // 3. Extract Metadata (Timestamp & Image)
            let timestamp = publisher.selectors.timestamp ? $(publisher.selectors.timestamp).first().text().trim() : '';
            if (!timestamp) {
                timestamp = $('meta[property="article:published_time"]').attr('content') || '';
            }

            let imageUrl = $('meta[property="og:image"]').attr('content');

            return {
                url,
                publisherId: publisher.id,
                title,
                content,
                timestamp,
                imageUrl
            };

        } catch (error) {
            console.error(`[${publisher.name}] Extraction error on ${url}:`, error);
            return null;
        } finally {
            await page.close();
        }
    }
}
