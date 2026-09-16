import { Router } from 'express';
import { DispatchController } from './dispatch.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createDispatchSchema } from './dispatch.validation';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);

// List/view dispatches
router.get('/', DispatchController.getAll);
router.get('/:id', DispatchController.getById);

// Admin-only dispatch execution
router.post('/', authorize(UserRole.ADMIN), validate(createDispatchSchema), DispatchController.process);

export default router;
