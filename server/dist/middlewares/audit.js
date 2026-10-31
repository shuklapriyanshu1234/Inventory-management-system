"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const db_1 = __importDefault(require("../db"));
async function logAudit(req, action, entity, entityId, details) {
    try {
        const userId = req.user?.id || null;
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
        await db_1.default.auditLog.create({
            data: {
                userId,
                action,
                entity,
                entityId: entityId || null,
                details: JSON.stringify(details || {}),
                ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
            }
        });
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
