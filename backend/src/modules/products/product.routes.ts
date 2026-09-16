import { Router } from 'express';
import { ProductController } from './product.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', ProductController.getAll);
router.get('/:id', ProductController.getById);

export default router;
