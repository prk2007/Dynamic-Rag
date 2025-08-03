import { catalogTable, catalogVectorStore, chunksVectorStore } from "../../lancedb/client.js";
import { BaseTool, ToolParams } from "../base/tool.js";

export interface CatalogSearchParams extends ToolParams {
    text: string;
    maxResults?: number;
    useStructuredFormat?: boolean;
}

export class CatalogSearchTool extends BaseTool<CatalogSearchParams> {
    name = "catalog_search";
    description = `Search for relevant documents in the catalog and return complete information.
    
    IMPORTANT: This tool returns the complete relevant information from the document catalog.
    Do NOT attempt to access original document files. Use ONLY the information returned
    by this tool to answer questions. The returned content contains all available
    catalog information about the query topic.`;
    
    inputSchema = {
        type: "object" as const,
        properties: {
            text: {
                type: "string",
                description: "Search query to find relevant documents in the catalog"
            },
            maxResults: {
                type: "number",
                description: "Maximum number of results to return (default: 5)",
                default: 5
            },
            useStructuredFormat: {
                type: "boolean", 
                description: "Use structured response format (default: true)",
                default: true
            }
        },
        required: ["text"],
    };

    async execute(params: CatalogSearchParams) {
        try {
            const { text, maxResults = 5, useStructuredFormat = true } = params;
            
            console.error(`Catalog search for: "${text}" with maxResults: ${maxResults}`);
            
            const retriever = catalogVectorStore.asRetriever({
                k: maxResults
            });
            
            const results = await retriever.invoke(text);
            
            console.error(`Found ${results.length} catalog results`);
            
            if (useStructuredFormat) {
                return this.formatStructuredCatalogResponse(results, text);
            } else {
                return this.formatCatalogResponse(results, text);
            }
            
        } catch (error) {
            return this.handleError(error);
        }
    }

    private formatCatalogResponse(results: any[], query: string) {
        if (!results || results.length === 0) {
            return {
                content: [{
                    type: "text" as const,
                    text: `No relevant documents found in the catalog for the query: "${query}"\n\nThe document catalog does not contain information about this topic. Please try a different search term or ask about topics that might be covered in the available documents.`
                }],
                isError: false
            };
        }

        const responseParts = [
            `Document catalog search results for: "${query}"`,
            "",
            "Here are the relevant documents from the catalog:",
            "=".repeat(60),
            ""
        ];

        results.forEach((result, index) => {
            // Extract information from the result
            const content = result.pageContent || result.content || result.text || 'No description available';
            const metadata = result.metadata || {};
            const source = metadata.source || 'Unknown source';
            const hash = metadata.hash || 'No hash';
            
            // Extract just the filename from the full path
            const filename = source.split('/').pop() || source;

            responseParts.push(
                `DOCUMENT ${index + 1}:`,
                `Filename: ${filename}`,
                `Source Path: ${source}`,
                `Document Hash: ${hash}`,
                `Description: ${content.trim()}`,
                "-".repeat(40),
                ""
            );
        });

        responseParts.push(
            "",
            "IMPORTANT INSTRUCTIONS:",
            "- The above represents ALL available documents in the catalog for your search",
            "- Use this information to understand what documents are available",
            "- Do NOT attempt to access the original document files",
            "- If you need specific content from these documents, use the chunks search tool",
            "- Provide information about these documents based on the descriptions above"
        );

        return {
            content: [{
                type: "text" as const,
                text: responseParts.join('\n')
            }],
            isError: false
        };
    }

    private formatStructuredCatalogResponse(results: any[], query: string) {
        if (!results || results.length === 0) {
            return {
                content: [{
                    type: "text" as const,
                    text: `CATALOG SEARCH RESULTS\nQuery: "${query}"\nResult: No matching documents found in catalog`
                }],
                isError: false
            };
        }

        const uniqueSources = [...new Set(results.map(r => {
            const source = r.metadata?.source || 'Unknown';
            return source.split('/').pop();
        }))];

        const responseText = `
DOCUMENT CATALOG SEARCH RESULTS
Query: "${query}"
Documents Found: ${results.length}
Unique Files: ${uniqueSources.length}
Files: ${uniqueSources.join(', ')}

AVAILABLE DOCUMENTS:
${results.map((result, index) => {
    const content = result.pageContent || result.content || result.text || 'No description';
    const metadata = result.metadata || {};
    const source = metadata.source || 'Unknown';
    const filename = source.split('/').pop();
    const hash = metadata.hash || 'Unknown';
    
    return `
[${index + 1}] ${filename}
    Path: ${source}
    Hash: ${hash}
    Description: ${content.trim()}
`;
}).join('\n')}

CATALOG SEARCH SUMMARY:
This represents ALL documents in the catalog matching your search criteria.
These are the available documents that contain information related to "${query}".
To get specific content from any of these documents, you would need to search the document chunks.

Do not attempt to access the original files directly. Use the information above to understand what documents are available.
`;

        return {
            content: [{
                type: "text" as const,
                text: responseText
            }],
            isError: false
        };
    }
}