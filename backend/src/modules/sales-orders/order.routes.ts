import { Router } from 'express';
import { OrderController } from './order.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);

// View routes accessible to all authenticated roles
router.get('/', OrderController.getAll);
router.get('/:id', OrderController.getById);

// Admin-only mutation routes
router.post('/:id/confirm', authorize(UserRole.ADMIN), OrderController.confirm);
router.post('/:id/cancel', authorize(UserRole.ADMIN), OrderController.cancel);

export default router;
