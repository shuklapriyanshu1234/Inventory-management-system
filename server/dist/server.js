"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const db_1 = __importDefault(require("./db"));
const app = (0, app_1.createApp)();
const server = app.listen(config_1.config.port, () => {
    console.log(`====================================================`);
    console.log(`XYZ Retail Corporation Inventory Management System`);
    console.log(`Server running at: http://localhost:${config_1.config.port}`);
    console.log(`API Documentation: http://localhost:${config_1.config.port}/api/docs`);
    console.log(`Health Check:      http://localhost:${config_1.config.port}/health`);
    console.log(`====================================================`);
});
// Graceful shutdown
const handleShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
        console.log('HTTP server closed.');
        await db_1.default.$disconnect();
        console.log('Database disconnected.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Forced shutdown after 10s timeout');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
