import { Router } from 'express';
import { CustomerController } from './customer.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createCustomerSchema } from './customer.validation';

const router = Router();

router.use(authenticate);
router.get('/', CustomerController.getAll);
router.get('/:id', CustomerController.getById);
router.post('/', validate(createCustomerSchema), CustomerController.create);

export default router;
