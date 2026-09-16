import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.details);
  }

  // Handle Prisma unique constraint violations (P2002)
  if (err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
    return sendError(res, `A record with this ${target} already exists.`, 409);
  }

  // Handle Prisma foreign key constraint violations (P2003)
  if (err.code === 'P2003') {
    return sendError(res, 'Referenced parent record does not exist or has active dependencies.', 400);
  }

  // Handle Prisma record not found (P2025)
  if (err.code === 'P2025') {
    return sendError(res, 'The requested record was not found.', 404);
  }

  console.error('Unhandled Server Error:', err);
  return sendError(res, 'Internal Server Error', 500);
}
