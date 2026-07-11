export interface PublisherConfig {
    id: string;
    name: string;
    entryPoints: string[];
    selectors: {
        articleLink: string;
        title: string;
        mainContent: string;
        paragraphs: string;
        timestamp?: string;
    };
    linkFilters?: {
        requireIncludes?: string[];
        excludeIncludes?: string[];
    };
}
