# 🗄️ LanceDB MCP Server for Cursor

[![Node.js 18+](https://img.shields.io/badge/node-18%2B-blue.svg)](https://nodejs.org/en/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An HTTP-based Model Context Protocol (MCP) server that enables Cursor IDE to interact directly with documents through agentic RAG and hybrid search in LanceDB. Ask questions about your document dataset as a whole or about specific documents.

## ✨ Features

- 🔍 **LanceDB-powered** serverless vector index and document summary catalog
- 🌐 **HTTP-based MCP** server compatible with Cursor IDE
- 🎯 **OpenAI Embeddings** for high-quality semantic search (text-embedding-3-small)
- 📊 **Efficient token usage** - The LLM looks up what it needs when it needs it
- 📈 **Security** - Index is stored locally, minimizing data transfer
- 🚀 **Multiple seed script options** - TypeScript/Node.js and Python implementations available

## ⚠️ Important Notes

- **This is an HTTP-based MCP server**, not stdio-based
- **Designed for Cursor IDE**, not Claude Desktop
- **Requires OpenAI API key** for embeddings (uses text-embedding-3-small model)
- **The client.js uses OpenAI embeddings**, not Ollama embeddings

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npx
- **OpenAI API Key** (for embeddings)
- **Cursor IDE** with MCP support
- Summarization models for seeding (if using Ollama):
  - `ollama pull snowflake-arctic-embed2` (for seed scripts)
  - `ollama pull gemma3:4b` (for summarization)

### Configuration Required

Before running the server, you need to configure your OpenAI API key in the client.ts file:

1. Open `src/lancedb/client.ts`
2. Replace `{OPEN_AI_KEY}` with your actual OpenAI API key:
```typescript
const OPENAI_API_KEY = "your-actual-openai-api-key-here";
```

### Installation & Setup

1. **Build the project:**
```bash
npm install
npm run build
```

2. **Configure Cursor IDE:**

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lancedb": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

3. **Start the MCP server:**
```bash
node dist/index.js
```

The server will run on port 3001 by default. You can change this with the `PORT` environment variable:
```bash
PORT=3002 node dist/index.js
```

### Server Endpoints

The HTTP server provides multiple endpoints:

- `GET /` - Server information and configuration instructions
- `POST /mcp` - Main MCP JSON-RPC endpoint for Cursor
- `GET /tools` - List available tools
- `POST /search` - Direct search API for testing
- `GET /health` - Health check endpoint
- `POST /test-mcp` - Test MCP protocol implementation

### Testing the Server

Test if the server is running correctly:

```bash
# Check server health
curl http://localhost:3001/health

# List available tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Direct search test
curl -X POST http://localhost:3001/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test search"}'
```

## 📚 Seeding Data

The seed script creates two tables in LanceDB:
1. **Catalog table** - Document summaries and metadata
2. **Chunks table** - Vectorized document chunks for semantic search

### ⚠️ Embedding Model Mismatch Warning

**Important**: The seed scripts use different embedding models than the MCP server:
- **Seed scripts**: Use Ollama embeddings (snowflake-arctic-embed2) or API-specific embeddings
- **MCP server**: Uses OpenAI embeddings (text-embedding-3-small)

**This means you must use compatible seed scripts or modify the embedding configuration to match.**

### Option 1: TypeScript/Node.js Seed Script (Built-in)

⚠️ **Note**: The default TypeScript seed script uses Ollama embeddings. You'll need to modify it to use OpenAI embeddings for compatibility with the server.

```bash
npm run seed -- --dbpath <PATH_TO_LOCAL_INDEX_DIR> --filesdir <PATH_TO_DOCS>
```

Optional flags:
- `--overwrite` - Recreate the index from scratch

Example:
```bash
npm run seed -- --dbpath /Users/username/lancedb-index --filesdir /Users/username/documents --overwrite
```

### Option 2: Python Seed Scripts

The Python seed scripts are available in the `Seed Script` directory within the project:

#### OpenAI-based Script (Recommended for compatibility)
```bash
cd "Seed Script"
python3 seed_openai.py --dbpath <PATH_TO_LOCAL_INDEX_DIR> --filesdir <PATH_TO_DOCS> --api-key <YOUR_OPENAI_API_KEY>
```

#### Gemini-based Script
```bash
cd "Seed Script"
python3 seed_gemini.py --dbpath <PATH_TO_LOCAL_INDEX_DIR> --filesdir <PATH_TO_DOCS> --api-key <YOUR_GEMINI_API_KEY>
```

#### Standard Python Script (Ollama models - Not compatible without modification)
```bash
cd "Seed Script"
python3 seed.py --dbpath <PATH_TO_LOCAL_INDEX_DIR> --filesdir <PATH_TO_DOCS> [--overwrite]
```

### Python Requirements

Before running Python scripts, install dependencies:
```bash
cd "Seed Script"
pip install -r requirenments.txt
```

### Configuration

Default models can be adjusted in:
- **TypeScript**: `src/config.ts`
- **Python**: Variables at the top of each seed script
- **Client embeddings**: `src/lancedb/client.ts` (OpenAI embeddings)

Current server configuration in `src/lancedb/client.ts`:
```typescript
const OPENAI_API_KEY = "{OPEN_AI_KEY}"; // Replace with your key
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
```

## 🎯 Example Usage in Cursor

Once configured, you can use the MCP server in Cursor by:

1. Opening Cursor IDE
2. Using the MCP integration to query your documents
3. Example prompts:
   - "What documents do we have in the catalog?"
   - "Summarize the key topics across all documents"
   - "Find information about [specific topic] in our documents"
   - "What does [specific document] say about [topic]?"

## 📝 Available Tools

The server provides these tools for interaction with the index:

### Catalog Tools
- `catalog_search`: Search for relevant documents in the catalog

### Chunks Tools
- `chunks_search`: Find relevant chunks based on a specific document from the catalog
- `all_chunks_search`: Find relevant chunks from all known documents

## 🏗️ Project Structure

```
lance-mcp/
├── src/
│   ├── Seed/           # Seed script utilities
│   ├── lancedb/        # LanceDB integration
│   │   └── client.ts   # OpenAI embeddings configuration
│   ├── tools/          # MCP tools implementation
│   ├── utils/          # Utility functions
│   ├── config.ts       # Configuration settings
│   ├── index.ts        # HTTP MCP server entry point
│   └── seed.ts         # TypeScript seed script
├── Seed Script/        # Python seed scripts
│   ├── seed.py         # Python seed script (Ollama)
│   ├── seed_gemini.py  # Gemini-based seed script
│   ├── seed_openai.py  # OpenAI-based seed script
│   ├── requirenments.txt # Python dependencies
│   └── ReadMe.md       # Python scripts documentation
├── sample-docs/        # Sample documents for testing
├── dist/               # Compiled JavaScript (generated)
├── package.json        # Node dependencies
└── tsconfig.json       # TypeScript configuration
```

## 🔧 Development

### Building the Project
```bash
npm run build
```

### Watch Mode (Auto-rebuild on changes)
```bash
npm run watch
```

### Environment Variables

- `PORT` - Server port (default: 3001)
- `DEFAULT_DB_PATH` - Default database path (default: '{path_to_lanceDB}')
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

Example:
```bash
PORT=3002 DEFAULT_DB_PATH=/path/to/db node dist/index.js
```

## 🐛 Troubleshooting

### Common Issues

1. **OpenAI API Key not configured**: 
   - Edit `src/lancedb/client.ts` and add your OpenAI API key
   - Rebuild the project: `npm run build`

2. **Embedding model mismatch**:
   - Ensure seed scripts and server use compatible embeddings
   - Recommended: Use `seed_openai.py` for seeding when using OpenAI embeddings in the server

3. **Cursor not connecting**:
   - Verify `~/.cursor/mcp.json` configuration
   - Check server is running on the correct port
   - Test with: `curl http://localhost:3001/health`

4. **Database path issues**: 
   - Use absolute paths for database and file directories
   - Ensure the path exists and has write permissions

5. **CORS errors**:
   - The server is configured to accept Cursor requests
   - Additional origins can be added via `ALLOWED_ORIGINS` environment variable

6. **Memory issues with large documents**: 
   - Consider adjusting chunk size in seed scripts
   - Process documents in batches

7. **Python dependencies issues**:
   - Make sure you're in the `Seed Script` directory when installing requirements
   - Use virtual environment if needed:
     ```bash
     cd "Seed Script"
     python3 -m venv venv
     source venv/bin/activate  # On Windows: venv\Scripts\activate
     pip install -r requirenments.txt
     ```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions:
- GitHub Issues( Original Repo ): [https://github.com/adiom-data/lance-mcp/issues](https://github.com/adiom-data/lance-mcp/issues)
- Author: Alex Komyagin (alex@adiom.io)
- Prashant Khurana [ Modified to support OPEN_AI embeddings for publicly available data. ]

## 🔗 Related Links

- [Cursor IDE](https://cursor.sh)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [LanceDB](https://lancedb.com)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
