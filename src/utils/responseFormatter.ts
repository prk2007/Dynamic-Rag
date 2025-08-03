// Add this utility function to format responses for Claude
// You can create a new file like utils/responseFormatter.js or add it to your existing tool files

export function formatResponseForClaude(results, query, toolName = 'query') {
    if (!results || results.length === 0) {
        return {
            content: [{
                type: "text",
                text: `No relevant information found in the knowledge base for the query: "${query}"\n\nThe knowledge base does not contain information about this topic. Please try a different query or ask about topics that might be covered in the available documents.`
            }],
            isError: false
        };
    }

    const responseParts = [
        `Based on the knowledge base search for: "${query}"`,
        "",
        "Here is the relevant information from the documents:",
        "=".repeat(60),
        ""
    ];

    results.forEach((result, index) => {
        // Handle different result formats
        const content = result.content || result.page_content || result.text || 'No content available';
        const metadata = result.metadata || {};
        const source = metadata.source || 'Unknown source';
        const page = metadata.page || 0;
        
        // Extract just the filename from the full path
        const filename = source.split('/').pop() || source;

        responseParts.push(
            `DOCUMENT ${index + 1}:`,
            `Source: ${filename} (Page ${page})`,
            `Content: ${content.trim()}`,
            "-".repeat(40),
            ""
        );
    });

    responseParts.push(
        "",
        "IMPORTANT INSTRUCTIONS FOR RESPONSE:",
        "- Answer the question using ONLY the information provided above",
        "- Do NOT attempt to access the original document files",
        "- If the information above doesn't fully answer the question, state what information is missing",
        "- Cite the specific document sources when making claims",
        "- Provide a comprehensive answer based on ALL the documents shown above"
    );

    return {
        content: [{
            type: "text",
            text: responseParts.join('\n')
        }],
        isError: false
    };
}

// Alternative formatter for more structured responses
export function formatStructuredResponse(results, query) {
    if (!results || results.length === 0) {
        return {
            content: [{
                type: "text", 
                text: `Knowledge base search found no relevant information for: "${query}"`
            }],
            isError: false
        };
    }

    const summary = {
        query: query,
        documentsFound: results.length,
        sources: [...new Set(results.map(r => {
            const source = r.metadata?.source || r.source || 'Unknown';
            return source.split('/').pop();
        }))],
        totalSources: 0
    };
    summary.totalSources = summary.sources.length;

    const responseText = `
KNOWLEDGE BASE SEARCH RESULTS
Query: "${query}"
Documents Found: ${summary.documentsFound}
Unique Sources: ${summary.totalSources}
Sources: ${summary.sources.join(', ')}

DOCUMENT EXCERPTS:
${results.map((result, index) => {
    const content = result.content || result.page_content || result.text || 'No content';
    const metadata = result.metadata || {};
    const source = (metadata.source || 'Unknown').split('/').pop();
    const page = metadata.page || 0;
    
    return `
[${index + 1}] ${source} (Page ${page})
${content.trim()}
`;
}).join('\n---\n')}

INSTRUCTIONS:
This represents ALL available information in the knowledge base for your query. 
Please provide a complete answer based exclusively on the excerpts above.
Do not attempt to access the original documents.
`;

    return {
        content: [{
            type: "text",
            text: responseText
        }],
        isError: false
    };
}