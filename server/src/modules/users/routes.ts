import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../db';
import { authenticate, authorize, requireRole, AuthRequest } from '../../middlewares/auth';
import { logAudit } from '../../middlewares/audit';

const router = Router();

// List Users (Admin/Manager)
router.get('/', authenticate, authorize('users:read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
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
  } catch (err) {
    next(err);
  }
});

// Update User (Admin only)
router.patch('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, password } = req.body;

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (role !== undefined) dataToUpdate.role = role;
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      dataToUpdate.passwordHash = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true }
    });

    await logAudit(req, 'UPDATE_USER', 'User', id, dataToUpdate);
    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
});

// Delete User (Admin only)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (id === req.user?.id) {
      res.status(400).json({ error: 'Cannot delete own account' });
      return;
    }

    await prisma.user.delete({ where: { id } });
    await logAudit(req, 'DELETE_USER', 'User', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// View Audit Logs (Admin only)
router.get('/audit-logs/all', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const entity = req.query.entity as string | undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (entity) where.entity = entity;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
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
  } catch (err) {
    next(err);
  }
});

export default router;
