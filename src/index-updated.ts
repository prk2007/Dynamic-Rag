#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToLanceDB, closeLanceDB } from "./lancedb/client.js";
import { ToolRegistry } from "./tools/registry.js";
import * as defaults from './config.js';

// Import database and queue
import { testConnection, closePool, healthCheck as dbHealthCheck } from './database/connection.js';
import { testRedisConnection, closeRedisConnection, redisHealthCheck } from './queue/connection.js';

// Import routes
import authRoutes from './routes/auth.js';

// Import middleware
import { authenticate } from './middleware/authenticate.js';
import { rateLimit } from './middleware/rate-limit.js';

// Load environment variables
dotenv.config();

// Configuration
const CONFIG = {
    PORT: parseInt(process.env.PORT || '3001'),
    DEFAULT_DB_PATH: process.env.DEFAULT_DB_PATH || './data/default',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || [
        'https://claude.ai',
        'vscode-webview://*',
        'https://cursor.sh',
        'http://localhost:3000',
        'http://localhost:3001'
    ]
};

class DynamicRAGServer {
    private app: express.Application;
    private server: Server;
    private toolRegistry: ToolRegistry;
    private isInitialized = false;

    constructor() {
        this.app = express();
        this.toolRegistry = new ToolRegistry();
        this.server = new Server({
            name: "dynamic-rag-server",
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
        // Enhanced CORS for MCP clients
        this.app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);

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

        this.app.options('*', cors());

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${req.method} ${req.path}`);
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
                    name: "dynamic-rag-server",
                    version: "1.0.0"
                }
            };
        });

        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: this.toolRegistry.getToolSchemas(),
                _meta: {},
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const name = request.params.name;
            const args = request.params.arguments ?? {};

            try {
                const tool = this.toolRegistry.getTool(name);
                if (!tool) {
                    throw new Error(`Unknown tool: ${name}`);
                }

                const result = await tool.execute(args);
                return result;
            } catch (error: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: ${error.message}`,
                    }],
                    isError: true,
                };
            }
        });
    }

    private setupRoutes() {
        // Health check (public)
        this.app.get('/health', async (req, res) => {
            const dbHealth = await dbHealthCheck();
            const redisHealth = await redisHealthCheck();

            const healthy = dbHealth.healthy && redisHealth.healthy;

            res.status(healthy ? 200 : 503).json({
                status: healthy ? 'healthy' : 'unhealthy',
                server: 'dynamic-rag-server',
                version: '1.0.0',
                initialized: this.isInitialized,
                timestamp: new Date().toISOString(),
                services: {
                    database: dbHealth,
                    redis: redisHealth,
                }
            });
        });

        // Authentication routes (public)
        this.app.use('/api/auth', authRoutes);

        // Protected MCP endpoint (requires authentication)
        this.app.post('/mcp', authenticate, rateLimit, async (req, res) => {
            try {
                const { jsonrpc, id, method, params = {} } = req.body;

                if (!req.body || Object.keys(req.body).length === 0) {
                    return res.status(400).json({
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32600,
                            message: "Invalid Request: Empty request body"
                        }
                    });
                }

                if (!method) {
                    return res.status(400).json({
                        jsonrpc: "2.0",
                        id: id || null,
                        error: {
                            code: -32600,
                            message: "Invalid Request: Missing method field"
                        }
                    });
                }

                let result;

                switch (method) {
                    case 'initialize':
                        result = {
                            protocolVersion: "2024-11-05",
                            capabilities: {
                                tools: { list: true, call: true },
                                resources: {}
                            },
                            serverInfo: {
                                name: "dynamic-rag-server",
                                version: "1.0.0"
                            }
                        };
                        break;

                    case 'tools/list':
                        result = {
                            tools: this.toolRegistry.getToolSchemas()
                        };
                        break;

                    case 'tools/call':
                        const toolName = params?.name;
                        const toolArgs = params?.arguments || {};

                        if (!toolName) {
                            throw new Error('Tool name is required');
                        }

                        const tool = this.toolRegistry.getTool(toolName);
                        if (!tool) {
                            throw new Error(`Unknown tool: ${toolName}`);
                        }

                        result = await tool.execute(toolArgs);
                        break;

                    case 'notifications/initialized':
                    case 'notifications/cancelled':
                        return res.status(200).send();

                    case 'ping':
                        result = {};
                        break;

                    default:
                        throw new Error(`Unknown method: ${method}`);
                }

                res.json({
                    jsonrpc: "2.0",
                    id,
                    result
                });

            } catch (error: any) {
                res.json({
                    jsonrpc: "2.0",
                    id: req.body?.id || null,
                    error: {
                        code: -32603,
                        message: error.message
                    }
                });
            }
        });

        // Public MCP info
        this.app.get('/mcp', (req, res) => {
            res.json({
                name: 'Dynamic RAG Server',
                version: '1.0.0',
                protocol: 'Model Context Protocol',
                transport: 'HTTP JSON-RPC',
                authentication: 'JWT Bearer Token',
                endpoints: {
                    'POST /mcp': 'MCP JSON-RPC endpoint (requires auth)',
                    'GET /tools': 'List available tools',
                    'POST /api/auth/signup': 'Create account',
                    'POST /api/auth/login': 'Login'
                }
            });
        });

        // List tools (public for discovery)
        this.app.get('/tools', (req, res) => {
            res.json({
                tools: this.toolRegistry.getToolSchemas(),
                total_tools: this.toolRegistry.getToolSchemas().length
            });
        });

        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                message: 'Dynamic RAG Server',
                version: '1.0.0',
                status: this.isInitialized ? 'ready' : 'initializing',
                endpoints: {
                    'GET /health': 'Health check',
                    'POST /api/auth/signup': 'Create account',
                    'POST /api/auth/login': 'Login',
                    'POST /mcp': 'MCP endpoint (requires auth)',
                    'GET /tools': 'List tools'
                },
                documentation: 'See SETUP.md for usage instructions'
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                path: req.path,
                method: req.method
            });
        });

        // Error handler
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Server error:', err);
            res.status(500).json({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
            });
        });
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Dynamic RAG Server...\n');

            // Test PostgreSQL connection
            console.log('📊 Testing PostgreSQL connection...');
            const dbConnected = await testConnection();
            if (!dbConnected) {
                throw new Error('PostgreSQL connection failed');
            }

            // Test Redis connection
            console.log('🔄 Testing Redis connection...');
            const redisConnected = await testRedisConnection();
            if (!redisConnected) {
                throw new Error('Redis connection failed');
            }

            // Connect to default LanceDB (optional for MCP tools)
            try {
                await connectToLanceDB(
                    CONFIG.DEFAULT_DB_PATH,
                    defaults.CHUNKS_TABLE_NAME,
                    defaults.CATALOG_TABLE_NAME
                );
                console.log('✅ Default LanceDB connected\n');
            } catch (error) {
                console.log('⚠️  Default LanceDB not available (will be created on first use)\n');
            }

            this.isInitialized = true;
            console.log('✅ Server initialized successfully\n');

        } catch (error) {
            console.error('❌ Initialization failed:', error);
            throw error;
        }
    }

    async start() {
        await this.initialize();

        const server = this.app.listen(CONFIG.PORT, () => {
            console.log('═══════════════════════════════════════════════════════');
            console.log('🚀 Dynamic RAG Server');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`📡 Server running on port ${CONFIG.PORT}`);
            console.log(`🌐 API: http://localhost:${CONFIG.PORT}/`);
            console.log(`🔐 Auth: http://localhost:${CONFIG.PORT}/api/auth/*`);
            console.log(`🤖 MCP: http://localhost:${CONFIG.PORT}/mcp`);
            console.log(`💚 Health: http://localhost:${CONFIG.PORT}/health`);
            console.log('═══════════════════════════════════════════════════════\n');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down server...');
            server.close();

            try {
                await closeLanceDB();
                await closePool();
                await closeRedisConnection();
                console.log('✅ All connections closed');
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
            }

            process.exit(0);
        });

        return server;
    }
}

// Start the server
const ragServer = new DynamicRAGServer();
ragServer.start().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
