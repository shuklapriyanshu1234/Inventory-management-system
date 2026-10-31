"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const config_1 = require("./config");
const db_1 = __importDefault(require("./db"));
const swagger_1 = require("./swagger");
const error_1 = require("./middlewares/error");
// Route modules
const routes_1 = __importDefault(require("./modules/auth/routes"));
const routes_2 = __importDefault(require("./modules/users/routes"));
const routes_3 = __importDefault(require("./modules/products/routes"));
const routes_4 = __importDefault(require("./modules/locations/routes"));
const routes_5 = __importDefault(require("./modules/inventory/routes"));
const routes_6 = __importDefault(require("./modules/orders/routes"));
const routes_7 = __importDefault(require("./modules/suppliers/routes"));
const routes_8 = __importDefault(require("./modules/barcode_rfid/routes"));
const routes_9 = __importDefault(require("./modules/reports/routes"));
const routes_10 = __importDefault(require("./modules/integrations/routes"));
const routes_11 = __importDefault(require("./modules/migration/routes"));
function createApp() {
    const app = (0, express_1.default)();
    // Security Headers
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false, // Allows inline scripts for frontend SPA & camera access
        crossOriginEmbedderPolicy: false
    }));
    // CORS
    app.use((0, cors_1.default)({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    }));
    // Body Parsing
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    // Rate Limiter
    const limiter = (0, express_rate_limit_1.default)({
        windowMs: config_1.config.rateLimitWindowMs,
        max: config_1.config.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' }
    });
    app.use('/api', limiter);
    // Serve static uploads
    app.use('/uploads', express_1.default.static(config_1.config.uploadDir));
    // Serve client static frontend files
    const clientPath = path_1.default.resolve(__dirname, '../../client');
    app.use(express_1.default.static(clientPath));
    // Health check endpoint
    app.get('/health', async (req, res) => {
        try {
            await db_1.default.$queryRaw `SELECT 1`;
            res.json({
                status: 'UP',
                timestamp: new Date().toISOString(),
                service: 'XYZ Retail Inventory System',
                database: 'CONNECTED',
                uptime: process.uptime()
            });
        }
        catch (err) {
            res.status(503).json({
                status: 'DOWN',
                database: 'DISCONNECTED',
                error: err.message
            });
        }
    });
    // Swagger OpenAPI Docs
    app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerDocument));
    // API Routes
    app.use('/api/auth', routes_1.default);
    app.use('/api/users', routes_2.default);
    app.use('/api/products', routes_3.default);
    app.use('/api/locations', routes_4.default);
    app.use('/api/inventory', routes_5.default);
    app.use('/api/orders', routes_6.default);
    app.use('/api/suppliers', routes_7.default);
    app.use('/api/barcode-rfid', routes_8.default);
    app.use('/api/reports', routes_9.default);
    app.use('/api/integrations', routes_10.default);
    app.use('/api/migration', routes_11.default);
    // Centralized Error Handler
    app.use(error_1.errorHandler);
    return app;
}
