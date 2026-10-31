import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../db';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { logAudit } from '../../middlewares/audit';
import { LocationSchema } from '../../shared/schemas';

const router = Router();

// Get all locations
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locations = await prisma.location.findMany({
      include: {
        _count: {
          select: { stocks: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(locations);
  } catch (err) {
    next(err);
  }
});

// Create location
router.post('/', authenticate, authorize('inventory:write'), validate(LocationSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code, name, type, address, isActive } = req.body;

    const existing = await prisma.location.findUnique({ where: { code } });
    if (existing) {
      res.status(400).json({ error: `Location code '${code}' already exists` });
      return;
    }

    const location = await prisma.location.create({
      data: { code, name, type, address, isActive: isActive !== undefined ? isActive : true }
    });

    await logAudit(req, 'CREATE_LOCATION', 'Location', location.id, { code, name, type });
    res.status(201).json(location);
  } catch (err) {
    next(err);
  }
});

// Update location
router.patch('/:id', authenticate, authorize('inventory:write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, type, address, isActive } = req.body;

    const location = await prisma.location.update({
      where: { id },
      data: { name, type, address, isActive }
    });

    await logAudit(req, 'UPDATE_LOCATION', 'Location', id, { name, type, isActive });
    res.json(location);
  } catch (err) {
    next(err);
  }
});

export default router;
