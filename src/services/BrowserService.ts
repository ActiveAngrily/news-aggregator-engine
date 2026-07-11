import { chromium } from 'playwright-extra';
import type { Browser, BrowserContext, Page } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';

// Add the stealth plugin to Playwright
chromium.use(stealth());

export class BrowserService {
    private static instance: BrowserService;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;

    private constructor() {}

    public static getInstance(): BrowserService {
        if (!BrowserService.instance) {
            BrowserService.instance = new BrowserService();
        }
        return BrowserService.instance;
    }

    public async initialize(): Promise<void> {
        if (!this.browser) {
            console.log('Initializing Headless Browser...');
            this.browser = await chromium.launch({
                headless: true, // Set to false if you want to watch the scraping process visually
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
                ]
            });
            
            // Create a realistic browser context
            this.context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                javaScriptEnabled: true,
            });
            
            console.log('Browser initialized successfully.');
        }
    }

    public async newPage(): Promise<Page> {
        if (!this.context) {
            throw new Error("Browser Context not initialized. Call initialize() first.");
        }
        return await this.context.newPage();
    }

    public async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            console.log('Browser closed.');
        }
    }
}
