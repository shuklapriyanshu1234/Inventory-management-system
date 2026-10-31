"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const db_1 = __importDefault(require("../db"));
const schemas_1 = require("../shared/schemas");
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader) {
        try {
            const apiKeyRecord = await db_1.default.apiKey.findUnique({
                where: { key: apiKeyHeader, isActive: true }
            });
            if (apiKeyRecord) {
                req.user = {
                    id: apiKeyRecord.id,
                    email: `api_${apiKeyRecord.name}@system.local`,
                    role: apiKeyRecord.role,
                    name: `API: ${apiKeyRecord.name}`
                };
                // Update lastUsedAt asynchronously
                db_1.default.apiKey.update({ where: { id: apiKeyRecord.id }, data: { lastUsedAt: new Date() } }).catch(() => { });
                return next();
            }
        }
        catch (err) {
            // Proceed to bearer token check if apiKey check fails
        }
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtAccessSecret);
        req.user = payload;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        return;
    }
}
function authorize(requiredPermission) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const permissions = schemas_1.RolePermissions[req.user.role] || [];
        if (!permissions.includes(requiredPermission)) {
            res.status(403).json({ error: `Forbidden: Requires permission ${requiredPermission}` });
            return;
        }
        next();
    };
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: `Forbidden: Requires one of roles [${roles.join(', ')}]` });
            return;
        }
        next();
    };
}
