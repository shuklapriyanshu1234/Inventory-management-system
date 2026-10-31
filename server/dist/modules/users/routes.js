"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const audit_1 = require("../../middlewares/audit");
const router = (0, express_1.Router)();
// List Users (Admin/Manager)
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('users:read'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const skip = (page - 1) * limit;
        const [total, users] = await Promise.all([
            db_1.default.user.count(),
            db_1.default.user.findMany({
                skip,
                take: limit,
                select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        res.json({
            data: users,
            meta: { total, page, limit, pages: Math.ceil(total / limit) }
        });
    }
    catch (err) {
        next(err);
    }
});
// Update User (Admin only)
router.patch('/:id', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, role, isActive, password } = req.body;
        const dataToUpdate = {};
        if (name !== undefined)
            dataToUpdate.name = name;
        if (role !== undefined)
            dataToUpdate.role = role;
        if (isActive !== undefined)
            dataToUpdate.isActive = isActive;
        if (password) {
            const salt = await bcryptjs_1.default.genSalt(10);
            dataToUpdate.passwordHash = await bcryptjs_1.default.hash(password, salt);
        }
        const updatedUser = await db_1.default.user.update({
            where: { id },
            data: dataToUpdate,
            select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_USER', 'User', id, dataToUpdate);
        res.json(updatedUser);
    }
    catch (err) {
        next(err);
    }
});
// Delete User (Admin only)
router.delete('/:id', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id === req.user?.id) {
            res.status(400).json({ error: 'Cannot delete own account' });
            return;
        }
        await db_1.default.user.delete({ where: { id } });
        await (0, audit_1.logAudit)(req, 'DELETE_USER', 'User', id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// View Audit Logs (Admin only)
router.get('/audit-logs/all', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '50', 10);
        const entity = req.query.entity;
        const skip = (page - 1) * limit;
        const where = {};
        if (entity)
            where.entity = entity;
        const [total, logs] = await Promise.all([
            db_1.default.auditLog.count({ where }),
            db_1.default.auditLog.findMany({
                where,
                skip,
                take: limit,
                include: { user: { select: { id: true, name: true, email: true, role: true } } },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        res.json({
            data: logs,
            meta: { total, page, limit, pages: Math.ceil(total / limit) }
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
