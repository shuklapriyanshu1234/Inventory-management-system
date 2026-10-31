"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../../db"));
const config_1 = require("../../config");
const validate_1 = require("../../middlewares/validate");
const schemas_1 = require("../../shared/schemas");
const auth_1 = require("../../middlewares/auth");
const router = (0, express_1.Router)();
function generateTokens(user) {
    const accessToken = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, config_1.config.jwtAccessSecret, { expiresIn: config_1.config.jwtAccessExpiry });
    const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, config_1.config.jwtRefreshSecret, { expiresIn: config_1.config.jwtRefreshExpiry });
    return { accessToken, refreshToken };
}
// Register
router.post('/register', (0, validate_1.validate)(schemas_1.RegisterSchema), async (req, res, next) => {
    try {
        const { email, password, name, role } = req.body;
        const existingUser = await db_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: 'Email already registered' });
            return;
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const user = await db_1.default.user.create({
            data: {
                email,
                passwordHash,
                name,
                role: role || 'WAREHOUSE_STAFF',
            },
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        const tokens = generateTokens(user);
        res.status(201).json({ user, ...tokens });
    }
    catch (err) {
        next(err);
    }
});
// Login
router.post('/login', (0, validate_1.validate)(schemas_1.LoginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
            res.status(401).json({ error: 'Invalid credentials or account inactive' });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const tokens = generateTokens(user);
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            ...tokens
        });
    }
    catch (err) {
        next(err);
    }
});
// Refresh Token
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            res.status(400).json({ error: 'Refresh token is required' });
            return;
        }
        const payload = jsonwebtoken_1.default.verify(refreshToken, config_1.config.jwtRefreshSecret);
        const user = await db_1.default.user.findUnique({ where: { id: payload.id } });
        if (!user || !user.isActive) {
            res.status(401).json({ error: 'Invalid refresh token or inactive account' });
            return;
        }
        const tokens = generateTokens(user);
        res.json(tokens);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
});
// Password Reset Request
router.post('/password-reset-request', (0, validate_1.validate)(schemas_1.PasswordResetRequestSchema), async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (user) {
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetTokenExp = new Date(Date.now() + 3600000); // 1 hour
            await db_1.default.user.update({
                where: { id: user.id },
                data: { resetToken, resetTokenExp }
            });
            console.log(`\n======================================================`);
            console.log(`[PASSWORD RESET STUB] User: ${email}`);
            console.log(`[PASSWORD RESET STUB] Token: ${resetToken}`);
            console.log(`[PASSWORD RESET STUB] Reset Link: http://localhost:4000/#reset-password?token=${resetToken}`);
            console.log(`======================================================\n`);
        }
        res.json({ message: 'If an account exists with this email, a reset token has been generated.' });
    }
    catch (err) {
        next(err);
    }
});
// Password Reset Confirm
router.post('/password-reset-confirm', (0, validate_1.validate)(schemas_1.PasswordResetConfirmSchema), async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;
        const user = await db_1.default.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExp: { gt: new Date() }
            }
        });
        if (!user) {
            res.status(400).json({ error: 'Invalid or expired password reset token' });
            return;
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(newPassword, salt);
        await db_1.default.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                resetToken: null,
                resetTokenExp: null
            }
        });
        res.json({ message: 'Password has been successfully updated' });
    }
    catch (err) {
        next(err);
    }
});
// Current User Profile
router.get('/me', auth_1.authenticate, async (req, res, next) => {
    try {
        const user = await db_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
