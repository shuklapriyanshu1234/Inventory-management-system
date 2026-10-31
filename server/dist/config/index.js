"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'xyz-super-secret-jwt-access-key-minimum-32-chars-long',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'xyz-super-secret-jwt-refresh-key-minimum-32-chars-long',
    jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
    jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    uploadDir: path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
};
