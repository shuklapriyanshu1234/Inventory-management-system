"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../../db"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const audit_1 = require("../../middlewares/audit");
const schemas_1 = require("../../shared/schemas");
const router = (0, express_1.Router)();
// Get all locations
router.get('/', auth_1.authenticate, async (req, res, next) => {
    try {
        const locations = await db_1.default.location.findMany({
            include: {
                _count: {
                    select: { stocks: true }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(locations);
    }
    catch (err) {
        next(err);
    }
});
// Create location
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('inventory:write'), (0, validate_1.validate)(schemas_1.LocationSchema), async (req, res, next) => {
    try {
        const { code, name, type, address, isActive } = req.body;
        const existing = await db_1.default.location.findUnique({ where: { code } });
        if (existing) {
            res.status(400).json({ error: `Location code '${code}' already exists` });
            return;
        }
        const location = await db_1.default.location.create({
            data: { code, name, type, address, isActive: isActive !== undefined ? isActive : true }
        });
        await (0, audit_1.logAudit)(req, 'CREATE_LOCATION', 'Location', location.id, { code, name, type });
        res.status(201).json(location);
    }
    catch (err) {
        next(err);
    }
});
// Update location
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('inventory:write'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, type, address, isActive } = req.body;
        const location = await db_1.default.location.update({
            where: { id },
            data: { name, type, address, isActive }
        });
        await (0, audit_1.logAudit)(req, 'UPDATE_LOCATION', 'Location', id, { name, type, isActive });
        res.json(location);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
