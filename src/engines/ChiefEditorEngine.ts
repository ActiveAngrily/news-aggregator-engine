import { GoogleGenAI } from '@google/genai';



export interface TemplateBlock {
    id: string;
    type: string;
    sectionTitle?: string;
    colSpan: number;
    rowSpan?: number;
    maxArticles: number;
}

export class ChiefEditorEngine {
    private ai: GoogleGenAI;
    private templateBlocks: TemplateBlock[];
    private promptBase: string;

    constructor(apiKey: string, templateBlocks: TemplateBlock[], promptBase: string) {
        this.ai = new GoogleGenAI({ apiKey });
        this.templateBlocks = templateBlocks;
        this.promptBase = promptBase;
    }

    async generateLayout(articles: any[]) {
        const articleInputs = articles.map(a => ({
            id: a.$id,
            title: a.title,
            summary: a.summary,
            score: a.importanceScore || 5,
            category: a.category || 'News'
        }));

        const slotDescriptions = this.templateBlocks.map(b => `${b.id}: Needs exactly ${b.maxArticles} articles.`).join('\n');
        
        const schema = this.templateBlocks.reduce((acc, b) => {
            acc[b.id] = Array.from({ length: b.maxArticles }, (_, i) => `id${i + 1}`);
            return acc;
        }, {} as Record<string, string[]>);

        const prompt = `${this.promptBase}

The template has ${this.templateBlocks.length} fixed slots that you need to fill with article IDs:
${slotDescriptions}

Rules:
- You must provide a JSON object where the keys are the slot IDs exactly as written above, and the values are arrays of article IDs.
- Never use an article ID that is not provided.
- Do not reuse the same article ID multiple times.

Input Articles:
${JSON.stringify(articleInputs, null, 2)}

Return ONLY a JSON object mapping the ${this.templateBlocks.length} slot IDs to arrays of article IDs.
Schema:
${JSON.stringify(schema, null, 2)}
`;

        try {
            console.log('Calling Gemini API for Chief Editor layout generation...');
            const apiCall = this.ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.2
                }
            });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Gemini API timeout')), 15000)
            );

            const response = await Promise.race([apiCall, timeoutPromise]) as any;

            const text = response.text;
            if (text) {
                const mapping = JSON.parse(text);
                return this.constructLayoutFromMapping(mapping);
            }
        } catch (error) {
            console.error('Error generating layout, trying fallback:', error);
            console.log('Generating fallback heuristic layout due to API errors...');
            return this.generateFallbackLayout(articles);
        }
    }

    private constructLayoutFromMapping(mapping: Record<string, string[]>) {
        return this.templateBlocks.map(block => {
            return {
                type: block.type,
                sectionTitle: block.sectionTitle,
                colSpan: block.colSpan,
                rowSpan: block.rowSpan,
                articles: mapping[block.id] || []
            };
        });
    }

    private generateFallbackLayout(articles: any[]) {
        let i = 0;
        const mapping: Record<string, string[]> = {};
        
        for (const block of this.templateBlocks) {
            const numArticles = Math.min(block.maxArticles, articles.length - i);
            mapping[block.id] = articles.slice(i, i + numArticles).map(a => a.$id);
            i += numArticles;
        }

        return this.constructLayoutFromMapping(mapping);
    }
}

