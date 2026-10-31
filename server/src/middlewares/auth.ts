import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db';
import { Role, RolePermissions } from '../shared/schemas';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (apiKeyHeader) {
    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { key: apiKeyHeader, isActive: true }
      });
      if (apiKeyRecord) {
        req.user = {
          id: apiKeyRecord.id,
          email: `api_${apiKeyRecord.name}@system.local`,
          role: apiKeyRecord.role as Role,
          name: `API: ${apiKeyRecord.name}`
        };
        // Update lastUsedAt asynchronously
        prisma.apiKey.update({ where: { id: apiKeyRecord.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        return next();
      }
    } catch (err) {
      // Proceed to bearer token check if apiKey check fails
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as AuthenticatedUser;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    return;
  }
}

export function authorize(requiredPermission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const permissions = RolePermissions[req.user.role] || [];
    if (!permissions.includes(requiredPermission)) {
      res.status(403).json({ error: `Forbidden: Requires permission ${requiredPermission}` });
      return;
    }

    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: `Forbidden: Requires one of roles [${roles.join(', ')}]` });
      return;
    }
    next();
  };
}
