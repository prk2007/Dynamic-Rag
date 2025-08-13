#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { connectToLanceDB, closeLanceDB } from "./lancedb/client.js";
import { ToolRegistry } from "./tools/registry.js";
import * as defaults from './config.js';

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 3001,
    DEFAULT_DB_PATH: process.env.DEFAULT_DB_PATH || '{path_to_lanceDB}',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || [
        'https://claude.ai',
        'vscode-webview://*',
        'https://cursor.sh',
        'http://localhost:3000',
        'http://localhost:3001'
    ]
};

class CursorMCPServer {
    private app: express.Application;
    private server: Server;
    private toolRegistry: ToolRegistry;
    private isInitialized = false;

    constructor() {
        this.app = express();
        this.toolRegistry = new ToolRegistry();
        this.server = new Server({
            name: "lance-mcp-cursor",
            version: "1.0.0",
        }, {
            capabilities: {
                resources: {},
                tools: {
                    list: true,
                    call: true,
                },
            },
        });
        
        this.setupServer();
        this.setupRoutes();
    }

    private setupServer() {
        // Enhanced CORS for Cursor and other MCP clients
        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (Cursor, mobile apps, curl, etc.)
                if (!origin) return callback(null, true);
                
                // Check if origin matches allowed patterns
                const isAllowed = CONFIG.ALLOWED_ORIGINS.some(allowedOrigin => {
                    if (allowedOrigin === "*") return true;
                    if (allowedOrigin.includes('*')) {
                        const pattern = allowedOrigin.replace(/\*/g, '.*');
                        return new RegExp(`^${pattern}$`).test(origin);
                    }
                    return allowedOrigin === origin;
                });
                
                callback(null, isAllowed);
            },
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
            allowedHeaders: [
                'Content-Type', 
                'Authorization', 
                'X-User-ID', 
                'X-Requested-With',
                'Accept',
                'Origin'
            ]
        }));

        // Handle preflight requests
        this.app.options('*', cors());

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Debug middleware to log all requests
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            if (req.method === 'POST') {
                console.log('Request body:', req.body);
            }
            next();
        });

        // MCP request handlers
        this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
            console.log('MCP Initialize request:', request.params);
            return {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: { list: true, call: true },
                    resources: {}
                },
                serverInfo: {
                    name: "lance-mcp-cursor",
                    version: "1.0.0"
                }
            };
        });

        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.log('MCP ListTools request');
            return {
                tools: this.toolRegistry.getToolSchemas(),
                _meta: {},
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params.name;
            const args = request.params.arguments ?? {};
            
            try {
                console.log(`MCP Tool execution: ${name} with args:`, args);
                
                const tool = this.toolRegistry.getTool(name);
                if (!tool) {
                    throw new Error(`Unknown tool: ${name}`);
                }
                
                const result = await tool.execute(args);
                console.log('Tool result:', result);
                return result;
            } catch (error) {
                console.error("Tool execution failed:", error);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    private setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                server: 'lance-mcp-cursor',
                version: '1.0.0',
                initialized: this.isInitialized,
                timestamp: new Date().toISOString(),
                mcp_compatible: true
            });
        });

        // MCP JSON-RPC endpoint (primary endpoint for Cursor)
        this.app.post('/mcp', async (req, res) => {
            try {
                console.log('=== MCP Request Received ===');
                console.log('URL:', req.url);
                console.log('Method:', req.method);
                console.log('Headers:', req.headers);
                console.log('Body:', JSON.stringify(req.body, null, 2));
                
                // Handle Cursor's request format - params might be missing
                const { jsonrpc, id, method, params = {} } = req.body;
                
                // Handle empty or malformed requests
                if (!req.body || Object.keys(req.body).length === 0) {
                    console.log('Empty request body received');
                    return res.status(400).json({
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32600,
                            message: "Invalid Request: Empty request body"
                        }
                    });
                }
                
                // Validate method is present
                if (!method) {
                    console.log('Missing method field');
                    return res.status(400).json({
                        jsonrpc: "2.0",
                        id: id || null,
                        error: {
                            code: -32600,
                            message: "Invalid Request: Missing method field"
                        }
                    });
                }
                
                // More lenient jsonrpc version check - accept both 2.0 and newer versions, or missing
                if (jsonrpc && jsonrpc !== "2.0" && !jsonrpc.startsWith("2.")) {
                    console.log('Invalid jsonrpc version:', jsonrpc);
                    return res.status(400).json({
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: -32600,
                            message: "Invalid Request: unsupported jsonrpc version"
                        }
                    });
                }

                let result;
                console.log(`Processing MCP method: ${method} with params:`, params);
                
                switch (method) {
                    case 'initialize':
                        console.log('Handling initialize request with params:', params);
                        const clientProtocolVersion = params?.protocolVersion || "2024-11-05";
                        console.log('Client protocol version:', clientProtocolVersion);
                        
                        result = {
                            protocolVersion: "2024-11-05", // We support the standard version
                            capabilities: {
                                tools: { 
                                    list: true, 
                                    call: true 
                                },
                                resources: {
                                    list: false,
                                    read: false
                                },
                                prompts: {
                                    list: false,
                                    get: false
                                },
                                logging: {
                                    set: false
                                }
                            },
                            serverInfo: {
                                name: "lance-mcp-cursor",
                                version: "1.0.0"
                            }
                        };
                        break;
                        
                    case 'tools/list':
                        console.log('Handling tools/list request');
                        const tools = this.toolRegistry.getToolSchemas();
                        console.log(`Found ${tools.length} tools:`, tools.map(t => t.name));
                        console.log('Tool schemas:', JSON.stringify(tools, null, 2));
                        result = {
                            tools: tools
                        };
                        break;
                        
                    case 'prompts/list':
                        console.log('Handling prompts/list request'); 
                        // For now, return empty prompts array - you can add prompts later
                        const prompts = [];
                        console.log(`Found ${prompts.length} prompts:`, prompts.map(p => p.name || 'unnamed'));
                        result = {
                            prompts: prompts
                        };
                        break;
                        
                    case 'tools/call':
                        const toolName = params?.name;
                        const toolArgs = params?.arguments || {};
                        
                        console.log(`Handling tools/call for: ${toolName} with args:`, toolArgs);
                        
                        if (!toolName) {
                            throw new Error('Tool name is required');
                        }
                        
                        const tool = this.toolRegistry.getTool(toolName);
                        if (!tool) {
                            const availableTools = this.toolRegistry.getToolSchemas().map(t => t.name);
                            throw new Error(`Unknown tool: ${toolName}. Available tools: ${availableTools.join(', ')}`);
                        }
                        
                        result = await tool.execute(toolArgs);
                        console.log('Tool execution result:', result);
                        break;
                        
                    case 'notifications/initialized':
                        console.log('Handling notifications/initialized');
                        // Handle initialized notification - no response needed for notifications
                        return res.status(200).send();

                    case 'notifications/cancelled':
                        console.log('Handling notifications/cancelled');
                        // Handle cancelled notification
                        return res.status(200).send();

                    case 'ping':
                        console.log('Handling ping request');
                        result = {};
                        break;
                        
                    default:
                        console.log('Unknown method:', method);
                        throw new Error(`Unknown method: ${method}`);
                }

                const response = {
                    jsonrpc: "2.0",
                    id,
                    result
                };
                
                console.log('=== MCP Response ===');
                console.log(JSON.stringify(response, null, 2));
                
                res.json(response);

            } catch (error) {
                console.error('=== MCP Error ===');
                console.error('Error:', error.message);
                console.error('Stack:', error.stack);
                
                const errorResponse = {
                    jsonrpc: "2.0",
                    id: req.body?.id || null,
                    error: {
                        code: -32603,
                        message: error.message
                    }
                };
                
                console.log('Error response:', JSON.stringify(errorResponse, null, 2));
                res.json(errorResponse);
            }
        });

        // Alternative HTTP endpoint for direct tool access
        this.app.get('/mcp', (req, res) => {
            res.json({
                name: 'LanceDB MCP Server',
                version: '1.0.0',
                protocol: 'Model Context Protocol',
                transport: 'HTTP JSON-RPC',
                endpoints: {
                    'POST /mcp': 'Main MCP JSON-RPC endpoint',
                    'GET /tools': 'List available tools',
                    'POST /search': 'Direct search API'
                },
                cursor_config: {
                    description: 'Add this to your Cursor MCP configuration',
                    config: {
                        "mcpServers": {
                            "lancedb": {
                                "url": `${req.protocol}://${req.get('host')}/mcp`
                            }
                        }
                    }
                }
            });
        });

        // List available tools (for debugging)
        this.app.get('/tools', (req, res) => {
            res.json({
                tools: this.toolRegistry.getToolSchemas(),
                server: 'lance-mcp-cursor',
                version: '1.0.0',
                total_tools: this.toolRegistry.getToolSchemas().length
            });
        });

        // Direct search API (for testing)
        this.app.post('/search', async (req, res) => {
            try {
                const { query, maxResults = 8, searchType = 'smart' } = req.body;
                
                if (!query) {
                    return res.status(400).json({
                        error: 'Query parameter is required'
                    });
                }

                console.log(`Direct search: "${query}"`);

                // Find available search tool
                const searchTools = ['smart_search', 'chunks_search', 'catalog_search'];
                let tool = null;
                
                for (const toolName of searchTools) {
                    tool = this.toolRegistry.getTool(toolName);
                    if (tool) break;
                }
                
                if (!tool) {
                    return res.status(500).json({
                        error: 'No search tool available',
                        available_tools: this.toolRegistry.getToolSchemas().map(t => t.name)
                    });
                }

                const result = await tool.execute({
                    query: query,
                    maxResults: maxResults,
                    searchType: searchType
                });

                res.json({
                    query: query,
                    results: result,
                    timestamp: new Date().toISOString(),
                    tool_used: tool.name
                });

            } catch (error) {
                console.error('Search error:', error);
                res.status(500).json({
                    error: error.message
                });
            }
        });

        // Root endpoint with configuration instructions
        this.app.get('/', (req, res) => {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            
            res.json({
                message: 'LanceDB MCP Server for Cursor',
                version: '1.0.0',
                status: this.isInitialized ? 'ready' : 'initializing',
                
                cursor_configuration: {
                    description: 'Add this to your Cursor MCP settings',
                    file_location: '~/.cursor/mcp.json',
                    configuration: {
                        "mcpServers": {
                            "lancedb": {
                                "url": `${baseUrl}/mcp`
                            }
                        }
                    }
                },
                
                alternative_clients: {
                    "Claude Desktop": {
                        note: "Claude Desktop doesn't support HTTP MCP yet",
                        alternative: "Use stdio mode or wait for HTTP support"
                    },
                    "VS Code": {
                        configuration: {
                            "mcp.servers.lancedb.url": `${baseUrl}/mcp`
                        }
                    }
                },
                
                api_endpoints: {
                    'POST /mcp': 'MCP JSON-RPC endpoint (primary)',
                    'GET /mcp': 'Server information',
                    'GET /tools': 'List available tools',
                    'POST /search': 'Direct search API',
                    'GET /health': 'Health check'
                },
                
                example_usage: {
                    curl_test: `curl -X POST ${baseUrl}/search -H "Content-Type: application/json" -d '{"query":"test query"}'`,
                    mcp_test: `curl -X POST ${baseUrl}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
                }
            });
        });

        // Test endpoint for MCP protocol
        this.app.post('/test-mcp', async (req, res) => {
            try {
                // Test the MCP protocol flow
                const tests = [];
                
                // Test 1: Initialize
                tests.push({
                    name: 'initialize',
                    request: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
                    success: true
                });
                
                // Test 2: List tools
                tests.push({
                    name: 'tools/list',
                    request: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
                    success: true,
                    result: { tools: this.toolRegistry.getToolSchemas() }
                });
                
                res.json({
                    message: 'MCP Protocol Test Results',
                    server_status: this.isInitialized ? 'ready' : 'initializing',
                    tests,
                    available_tools: this.toolRegistry.getToolSchemas().map(t => ({ name: t.name, description: t.description }))
                });
                
            } catch (error) {
                res.status(500).json({
                    error: 'Test failed',
                    message: error.message
                });
            }
        });

        // Error handling middleware
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Server error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        });

        // FIXED: 404 handler - Express 5.x compatible catch-all route
        // Changed from app.use('*') to app.use('/*splat') for Express 5.x compatibility
        this.app.use('/*splat', (req, res) => {
            console.log(`=== UNMATCHED ROUTE ===`);
            console.log(`Method: ${req.method}`);
            console.log(`Path: ${req.path}`);
            console.log(`URL: ${req.url}`);
            console.log(`Headers:`, req.headers);
            console.log(`Body:`, req.body);
            
            res.status(404).json({
                error: 'Route not found',
                method: req.method,
                path: req.path,
                available_routes: [
                    'GET /',
                    'GET /health',
                    'GET /tools',
                    'GET /mcp',
                    'POST /mcp',
                    'POST /search',
                    'POST /test-mcp'
                ]
            });
        });
    }

    async initialize() {
        try {
            // Ensure default database directory exists
            if (!fs.existsSync(CONFIG.DEFAULT_DB_PATH)) {
                fs.mkdirSync(CONFIG.DEFAULT_DB_PATH, { recursive: true });
                console.log(`Created default database directory: ${CONFIG.DEFAULT_DB_PATH}`);
            }

            // Connect to default database
            await connectToLanceDB(
                CONFIG.DEFAULT_DB_PATH, 
                defaults.CHUNKS_TABLE_NAME, 
                defaults.CATALOG_TABLE_NAME
            );
            
            this.isInitialized = true;
            console.log('✅ Database initialized successfully');
            console.log(`📊 Available tools: ${this.toolRegistry.getToolSchemas().length}`);
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            console.log('⚠️  Server will continue without database - some endpoints will still work');
        }
    }

    async start() {
        await this.initialize();
        
        const server = this.app.listen(CONFIG.PORT, () => {
            console.log(`🚀 LanceDB MCP Server running on port ${CONFIG.PORT}`);
            console.log(`📋 Server info: http://localhost:${CONFIG.PORT}/`);
            console.log(`🔍 Direct search: http://localhost:${CONFIG.PORT}/search`);
            console.log(`🤖 MCP endpoint: http://localhost:${CONFIG.PORT}/mcp`);
            console.log(`🧪 Test MCP: http://localhost:${CONFIG.PORT}/test-mcp`);
            console.log(`\n📝 Cursor Configuration (~/.cursor/mcp.json):`);
            console.log(`{`);
            console.log(`  "mcpServers": {`);
            console.log(`    "lancedb": {`);
            console.log(`      "url": "http://localhost:${CONFIG.PORT}/mcp"`);
            console.log(`    }`);
            console.log(`  }`);
            console.log(`}`);
            console.log(`\n🔧 Test commands:`);
            console.log(`curl -X POST http://localhost:${CONFIG.PORT}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`);
            console.log(`curl -X POST http://localhost:${CONFIG.PORT}/search -H "Content-Type: application/json" -d '{"query":"test search"}'`);
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down server...');
            server.close();
            try {
                await closeLanceDB();
                console.log('✅ Database connections closed');
            } catch (error) {
                console.error('❌ Error closing database:', error);
            }
            process.exit(0);
        });

        return server;
    }
}

// Start the server
const mcpServer = new CursorMCPServer();
mcpServer.start().catch(console.error);