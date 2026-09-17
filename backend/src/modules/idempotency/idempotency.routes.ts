import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { IdempotencyService } from './idempotency.service';
import { sendSuccess } from '../../utils/response';
import prisma from '../../config/prisma';

const router = Router();

/**
 * POST /api/idempotency/cleanup
 *
 * Admin-only operation that removes all expired idempotency records
 * (those whose expiresAt is in the past).
 *
 * Safe to call repeatedly — idempotent, never deletes active records.
 * Returns the count of deleted records.
 *
 * Intended to be called manually (e.g. via a scheduled task or admin script)
 * rather than automatically. No background worker is introduced.
 */
router.post(
  '/cleanup',
  authenticate,
  authorize('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const deletedCount = await IdempotencyService.cleanup(prisma);
      return sendSuccess(
        res,
        { deletedCount },
        `Cleaned up ${deletedCount} expired idempotency record(s)`,
        200
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/idempotency/stats
 *
 * Admin-only endpoint that returns counts by status and the number of
 * expired records pending cleanup. Useful for operational monitoring.
 */
router.get(
  '/stats',
  authenticate,
  authorize('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();

      const [completed, processing, failed, expired] = await Promise.all([
        prisma.idempotencyKey.count({ where: { status: 'COMPLETED' } }),
        prisma.idempotencyKey.count({ where: { status: 'PROCESSING' } }),
        prisma.idempotencyKey.count({ where: { status: 'FAILED' } }),
        prisma.idempotencyKey.count({ where: { expiresAt: { lt: now } } }),
      ]);

      return sendSuccess(
        res,
        { completed, processing, failed, expired, total: completed + processing + failed },
        'Idempotency statistics retrieved'
      );
    } catch (error) {
      next(error);
    }
  }
);

export default router;
