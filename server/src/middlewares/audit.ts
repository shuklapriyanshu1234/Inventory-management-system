import prisma from '../db';
import { AuthRequest } from './auth';

export async function logAudit(
  req: AuthRequest,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Record<string, any>
) {
  try {
    const userId = req.user?.id || null;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
    
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId || null,
        details: JSON.stringify(details || {}),
        ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
      }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
