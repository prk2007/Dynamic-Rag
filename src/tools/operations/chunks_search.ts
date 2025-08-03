import { chunksVectorStore } from "../../lancedb/client.js";
import { BaseTool, ToolParams } from "../base/tool.js";

export interface ChunksSearchParams extends ToolParams {
    text: string;
    maxResults?: number;
    useDetailedFormat?: boolean;
}

export class ChunksSearchTool extends BaseTool<ChunksSearchParams> {
    name = "chunks_search";
    description = `Search for specific content within document chunks and return relevant excerpts.
    
    IMPORTANT: This tool returns the complete relevant content from the document chunks.
    Do NOT attempt to access original document files. Use ONLY the information returned
    by this tool to answer questions. The returned content contains all available
    information from the knowledge base about the query topic.`;
    
    inputSchema = {
        type: "object" as const,
        properties: {
            text: {
                type: "string",
                description: "Search query to find relevant content within documents"
            },
            maxResults: {
                type: "number",
                description: "Maximum number of content chunks to return (default: 8)",
                default: 8
            },
            useDetailedFormat: {
                type: "boolean",
                description: "Use detailed format with enhanced context (default: true)",
                default: true
            }
        },
        required: ["text"],
    };

    async execute(params: ChunksSearchParams) {
        try {
            const { text, maxResults = 8, useDetailedFormat = true } = params;
            
            console.error(`Chunks search for: "${text}" with maxResults: ${maxResults}`);
            
            const retriever = chunksVectorStore.asRetriever({
                k: maxResults
            });
            
            const results = await retriever.invoke(text);
            
            console.error(`Found ${results.length} chunk results`);
            
            if (useDetailedFormat) {
                return this.formatDetailedChunksResponse(results, text);
            } else {
                return this.formatChunksResponse(results, text);
            }
            
        } catch (error) {
            return this.handleError(error);
        }
    }

    private formatChunksResponse(results: any[], query: string) {
        if (!results || results.length === 0) {
            return {
                content: [{
                    type: "text" as const,
                    text: `No relevant content found for the query: "${query}"\n\nThe document chunks do not contain information about this topic. Please try a different search term or rephrase your question.`
                }],
                isError: false
            };
        }

        const responseParts = [
            `Content search results for: "${query}"`,
            "",
            "Here is the relevant content from the documents:",
            "=".repeat(60),
            ""
        ];

        results.forEach((result, index) => {
            const content = result.pageContent || result.content || result.text || 'No content available';
            const metadata = result.metadata || {};
            const source = metadata.source || 'Unknown source';
            const page = metadata.page || 0;
            const chunkId = metadata.chunk_id || index;
            
            const filename = source.split('/').pop() || source;

            responseParts.push(
                `CONTENT CHUNK ${index + 1}:`,
                `Source: ${filename} (Page ${page}, Chunk ${chunkId})`,
                `Content: ${content.trim()}`,
                "-".repeat(40),
                ""
            );
        });

        responseParts.push(
            "",
            "RESPONSE INSTRUCTIONS:",
            "- Answer the question using ONLY the content provided above",
            "- Do NOT attempt to access the original document files", 
            "- If the content above doesn't fully answer the question, state what information is missing",
            "- Cite the specific document sources and pages when making claims",
            "- Provide a comprehensive answer based on ALL the content chunks shown above"
        );

        return {
            content: [{
                type: "text" as const,
                text: responseParts.join('\n')
            }],
            isError: false
        };
    }

    private formatDetailedChunksResponse(results: any[], query: string) {
        if (!results || results.length === 0) {
            return {
                content: [{
                    type: "text" as const,
                    text: `CONTENT SEARCH RESULTS\nQuery: "${query}"\nResult: No relevant content found in document chunks`
                }],
                isError: false
            };
        }

        const sources = [...new Set(results.map(r => {
            const source = r.metadata?.source || 'Unknown';
            return source.split('/').pop();
        }))];

        const pages = [...new Set(results.map(r => r.metadata?.page || 0))].sort();

        const responseText = `
COMPREHENSIVE CONTENT SEARCH RESULTS
Query: "${query}"

SEARCH SUMMARY:
- Content chunks found: ${results.length}
- Documents covered: ${sources.length}
- Pages covered: ${pages.join(', ')}
- Source documents: ${sources.join(', ')}

RELEVANT CONTENT EXCERPTS:
${results.map((result, index) => {
    const content = result.pageContent || result.content || result.text || 'No content';
    const metadata = result.metadata || {};
    const source = metadata.source || 'Unknown';
    const filename = source.split('/').pop();
    const page = metadata.page || 0;
    const chunkId = metadata.chunk_id || index;
    
    // Highlight potential key terms (simple approach)
    const highlightedContent = this.highlightQueryTerms(content, query);
    
    return `
[CHUNK ${index + 1}] ${filename} - Page ${page} (Chunk ${chunkId})
${highlightedContent.trim()}
`;
}).join('\n' + '-'.repeat(50) + '\n')}

COMPREHENSIVE ANALYSIS INSTRUCTIONS:
This represents ALL available content from the knowledge base relevant to your query.
Please provide a thorough answer based exclusively on the content excerpts above.

Key requirements:
- Synthesize information across all content chunks
- Reference specific documents and pages when making claims
- Note any conflicting information between sources
- If information seems incomplete, clearly state what is missing
- Do not attempt to access original document files
- This content represents the complete available knowledge on this topic
`;

        return {
            content: [{
                type: "text" as const,
                text: responseText
            }],
            isError: false
        };
    }

    private highlightQueryTerms(content: string, query: string): string {
        // Simple highlighting for better context
        const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
        let highlighted = content;
        
        queryWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            highlighted = highlighted.replace(regex, `**${word.toUpperCase()}**`);
        });
        
        return highlighted;
    }
}