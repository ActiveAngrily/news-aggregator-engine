import { GoogleGenAI } from '@google/genai';
import { ExtractedArticle } from './ExtractionEngine';
import { ArticleCluster } from './ClusteringEngine';

export interface AIWriterConfig {
    id: string;
    alias: string;
    category: string;
    systemPrompt: string;
}

export interface SynthesizedArticle {
    title: string;
    summary: string;
    content: string; // Markdown without sources appended
    sources: string[];
    imageUrl?: string;
    publishedAt: string;
    authorAlias: string;
    category: string;
}

export class SynthesisEngine {
    private ai: GoogleGenAI;
    private writers: AIWriterConfig[];

    constructor(writers: AIWriterConfig[]) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        this.writers = writers;
    }

    private async categorizeCluster(cluster: ArticleCluster): Promise<{ writer: AIWriterConfig, baseCategory: string, isOpinion: boolean }> {
        if (!this.writers || this.writers.length === 0) {
            throw new Error("No AI writers configured.");
        }
        
        const standardWriters = this.writers.filter(w => w.id !== 'opinion');
        const prompt = `Analyze this news cluster's headline: "${cluster.themeHeadline}"
        1. Classify the topic into exactly one of these IDs: ${standardWriters.map(w => w.id).join(', ')}.
        2. Decide if this cluster represents highly controversial, subjective, or debate-worthy news that demands a strong opinion piece. If so, format should be "opinion", otherwise "news".
        Respond ONLY with a JSON object in this format: { "categoryId": "...", "format": "news" | "opinion" }`;
        
        let writer = standardWriters[0];
        let baseCategory = writer.category;
        let isOpinion = false;

        try {
             const response = await this.ai.models.generateContent({
                 model: 'gemini-3.1-flash-lite',
                 contents: prompt,
                 config: { 
                     temperature: 0.1,
                     responseMimeType: 'application/json' 
                 }
             });
             
             if (response.text) {
                 const result = JSON.parse(response.text);
                 const categoryId = result.categoryId?.trim().toLowerCase();
                 isOpinion = result.format === 'opinion';
                 
                 const matchedWriter = standardWriters.find(w => w.id.toLowerCase() === categoryId);
                 if (matchedWriter) {
                     writer = matchedWriter;
                     baseCategory = matchedWriter.category;
                 }
                 
                 if (isOpinion) {
                     const opinionWriter = this.writers.find(w => w.id === 'opinion');
                     if (opinionWriter) {
                         writer = opinionWriter;
                     }
                 }
             }
        } catch (e) {
             console.error("[Synthesis] Error during categorization:", e);
        }
        
        return { writer, baseCategory, isOpinion };
    }

    public async synthesize(cluster: ArticleCluster): Promise<SynthesizedArticle | null> {
        console.log(`[Synthesis] Synthesizing cluster: "${cluster.themeHeadline}" (${cluster.articles.length} sources)`);
        
        const { writer, baseCategory, isOpinion } = await this.categorizeCluster(cluster);
        console.log(`[Synthesis] Selected Writer: ${writer.alias} (${writer.category}), Base Category: ${baseCategory}, Opinion: ${isOpinion}`);

        const prompt = `
You are an autonomous AI journalist for the "Red Letter" newspaper.
Your task is to synthesize raw articles from different publishers into a SINGLE, perfectly unbiased, highly readable news article.

YOUR PERSONA:
Alias: ${writer.alias}
Role: ${writer.category} reporter
${writer.systemPrompt}

RULES:
1. PURE OBJECTIVITY: Strip away ideological spin, sensationalism, loaded adjectives, and editorializing.
2. UNIVERSAL FACTS: Cross-reference the articles. Only include widely agreed-upon facts. Disagreements must be stated neutrally.
3. FORMATTING: Output beautifully formatted Markdown. Use paragraphs, bullet points if necessary. Do NOT wrap the entire response in markdown code blocks (\`\`\`markdown). Just output the raw markdown.
4. INLINE CITATIONS: When citing a specific fact, quote, number, or claim, you MUST embed an inline markdown hyperlink to the exact source URL provided (e.g. \`[According to CNN](https://edition.cnn.com/...)\`). 
5. NO SOURCES LIST AT BOTTOM: DO NOT append or list the source URLs at the bottom of the markdown. Our frontend UI will handle the sources list separately.
6. ORGANIC IMAGERY: You have access to the IMAGE URLs provided in the raw source articles. You MUST embed these images dynamically within your markdown content to break up the text and illustrate the narrative. Use standard markdown image syntax: \`![Image description | Source: Publisher Name](IMAGE URL)\`. The caption MUST include the image description and credit the publisher. CRITICAL: DO NOT reuse the same image URL multiple times in the article. If you only have one unique image available, use it exactly once. If you have multiple unique images, embed them throughout the article.
7. LENGTH: Approx 400-800 words.
8. HEADLINES AND QUOTES: If your role is 'Opinion', you MUST extract the most provocative quote and use it as your headline (e.g., "The system is fundamentally broken"). You MUST also identify the original speaker of the quote. For all other reporters, stick to traditional neutral headlines.

Respond ONLY with a JSON object in this exact format:
{
  "title": "A perfectly neutral, engaging headline (or the exact quote if Opinion)",
  "summary": "A concise 2-sentence summary of the article",
  "content": "The full markdown content of the synthesized article without sources appended",
  "speaker": "The person who said the quote (ONLY REQUIRED IF OPINION, otherwise omit or null)"
}

RAW SOURCE ARTICLES:
${cluster.articles.map((a, i) => `--- SOURCE ${i+1} (${a.publisherId}) ---\nURL: ${a.url}\nIMAGE URL: ${a.imageUrl || 'None'}\nTITLE: ${a.title}\nCONTENT: ${a.content.substring(0, 3000)}...\n`).join('\n')}
`;

        try {
            await new Promise(r => setTimeout(r, 4500)); // Respect rate limits

            const response = await this.ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.2, // Slightly creative to allow persona, but still objective
                }
            });

            if (!response.text) {
                throw new Error("Empty response from LLM");
            }

            const result = JSON.parse(response.text);

            if (result && result.title && result.content) {
                const imageSource = cluster.articles.find(a => a.imageUrl && a.imageUrl.length > 5);
                
                return {
                    title: result.title,
                    summary: result.summary || "No summary provided.",
                    content: result.content,
                    sources: cluster.articles.map(a => a.url),
                    imageUrl: imageSource?.imageUrl,
                    publishedAt: new Date().toISOString(),
                    authorAlias: (isOpinion && result.speaker) ? `OPINION:${result.speaker}` : writer.alias,
                    category: baseCategory
                };
            }
        } catch (error: any) {
            console.error(`[Synthesis] Error synthesizing cluster:`, error.message || error);
        }
        return null;
    }
}
