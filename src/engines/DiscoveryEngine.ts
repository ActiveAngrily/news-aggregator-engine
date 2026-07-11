import { BrowserService } from '../services/BrowserService';
import { PublisherConfig } from '../types';
import type { Page } from 'playwright';

export class DiscoveryEngine {
    private browserService: BrowserService;

    constructor() {
        this.browserService = BrowserService.getInstance();
    }

    public async discoverArticles(publisher: PublisherConfig): Promise<string[]> {
        console.log(`Starting discovery for ${publisher.name}...`);
        const allUrls = new Set<string>();

        // Ensure browser is initialized
        await this.browserService.initialize();

        for (const entryPoint of publisher.entryPoints) {
            console.log(`[${publisher.name}] Visiting entry point: ${entryPoint}`);
            const page = await this.browserService.newPage();

            try {
                await page.goto(entryPoint, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                // Extract raw hrefs
                const hrefs = await page.$$eval(publisher.selectors.articleLink, (elements) => {
                    return elements.map(el => (el as HTMLAnchorElement).href);
                });

                console.log(`[${publisher.name}] Found ${hrefs.length} raw links matching selector.`);

                for (let href of hrefs) {
                    // Resolve relative URLs (Playwright $$eval returning .href usually resolves them, but just in case)
                    try {
                        const urlObj = new URL(href, entryPoint);
                        // Clean up URL (remove query params and hash for clean deduplication)
                        urlObj.search = '';
                        urlObj.hash = '';
                        href = urlObj.toString();
                    } catch (e) {
                        continue; // Invalid URL
                    }

                    // Apply Filters
                    let isValid = true;
                    if (publisher.linkFilters) {
                        if (publisher.linkFilters.requireIncludes && publisher.linkFilters.requireIncludes.length > 0) {
                            isValid = publisher.linkFilters.requireIncludes.some(inc => href.includes(inc));
                        }
                        if (isValid && publisher.linkFilters.excludeIncludes && publisher.linkFilters.excludeIncludes.length > 0) {
                            isValid = !publisher.linkFilters.excludeIncludes.some(exc => href.includes(exc));
                        }
                    }

                    if (isValid) {
                        allUrls.add(href);
                    }
                }

            } catch (error) {
                console.error(`[${publisher.name}] Error visiting ${entryPoint}:`, error);
            } finally {
                await page.close();
            }
        }

        const finalUrls = Array.from(allUrls);
        console.log(`[${publisher.name}] Discovery complete. Found ${finalUrls.length} unique, filtered article URLs.`);
        return finalUrls;
    }
}
