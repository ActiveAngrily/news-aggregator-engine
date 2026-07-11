export interface PublisherConfig {
    id: string;
    name: string;
    entryPoints: string[]; // e.g. front pages or category pages
    selectors: {
        articleLink: string;   // CSS selector to find article URLs on the entry page
        title: string;         // CSS selector for the headline on the article page
        mainContent: string;   // CSS selector for the container of the article body
        paragraphs: string;    // CSS selector for the text nodes inside the container
        timestamp?: string;    // CSS selector for published date (optional, we can fallback to meta tags)
    };
    linkFilters?: {
        requireIncludes?: string[]; // URLs must contain one of these
        excludeIncludes?: string[]; // URLs must NOT contain these (e.g. '/video/')
    };
}

export const publishers: PublisherConfig[] = [
    {
        id: 'bbc',
        name: 'BBC News',
        entryPoints: [
            'https://www.bbc.com/news',
            'https://www.bbc.com/news/world'
        ],
        selectors: {
            articleLink: 'a[href^="/news/articles/"]',
            title: 'h1',
            mainContent: 'article, main',
            paragraphs: 'p, div[data-component="text-block"]',
        },
        linkFilters: {
            excludeIncludes: ['/live/', '/video/', '/audio/']
        }
    },
    {
        id: 'reuters',
        name: 'Reuters',
        entryPoints: [
            'https://www.reuters.com/world/',
            'https://www.reuters.com/business/'
        ],
        selectors: {
            articleLink: 'a[href*="/article/"], a[href*="/world/"], a[href*="/business/"]',
            title: 'h1',
            mainContent: 'article',
            paragraphs: 'p[data-testid="paragraph-0"], article p',
        },
        linkFilters: {
            excludeIncludes: ['/video/', '/pictures/', '/sports/']
        }
    },
    {
        id: 'ap',
        name: 'Associated Press',
        entryPoints: [
            'https://apnews.com/world-news',
            'https://apnews.com/politics'
        ],
        selectors: {
            articleLink: 'a[href*="/article/"]',
            title: 'h1',
            mainContent: '.RichTextStoryBody, article, main',
            paragraphs: 'p',
        },
        linkFilters: {
            requireIncludes: ['/article/'],
            excludeIncludes: ['/video/', '/hub/']
        }
    },
    {
        id: 'guardian',
        name: 'The Guardian',
        entryPoints: [
            'https://www.theguardian.com/world',
            'https://www.theguardian.com/us-news'
        ],
        selectors: {
            articleLink: 'a[href*="/202"]',
            title: 'h1',
            mainContent: '#maincontent, article, main',
            paragraphs: 'p',
        },
        linkFilters: {
            excludeIncludes: ['/live/', '/video/', '/audio/', '/gallery/', '/crosswords/']
        }
    },
    {
        id: 'cnn',
        name: 'CNN',
        entryPoints: [
            'https://edition.cnn.com/world',
            'https://edition.cnn.com/politics'
        ],
        selectors: {
            articleLink: 'a[href*="/202"]',
            title: 'h1',
            mainContent: '.article__content, .article-body, article',
            paragraphs: 'p.paragraph, p',
        },
        linkFilters: {
            excludeIncludes: ['/video/', '/live-news/', '/gallery/']
        }
    },
    {
        id: 'aljazeera',
        name: 'Al Jazeera',
        entryPoints: [
            'https://www.aljazeera.com/news/'
        ],
        selectors: {
            articleLink: 'a[href*="/202"]',
            title: 'h1',
            mainContent: 'main, article',
            paragraphs: 'p',
        },
        linkFilters: {
            excludeIncludes: ['/programmes/', '/video/', '/podcasts/']
        }
    },
    {
        id: 'npr',
        name: 'NPR',
        entryPoints: [
            'https://www.npr.org/sections/world/',
            'https://www.npr.org/sections/politics/'
        ],
        selectors: {
            articleLink: 'a[href*="/202"]',
            title: 'h1',
            mainContent: '#storytext, article, main',
            paragraphs: 'p',
        },
        linkFilters: {
            excludeIncludes: ['/podcasts/']
        }
    },
    {
        id: 'foxnews',
        name: 'Fox News',
        entryPoints: [
            'https://www.foxnews.com/world',
            'https://www.foxnews.com/politics'
        ],
        selectors: {
            articleLink: 'a[href*="/world/"], a[href*="/politics/"]',
            title: 'h1.headline, h1',
            mainContent: '.article-body, article, main',
            paragraphs: 'p',
        },
        linkFilters: {
            excludeIncludes: ['/video.foxnews.com', '/category/']
        }
    }
];

export function getPublisher(id: string): PublisherConfig | undefined {
    return publishers.find(p => p.id === id);
}
