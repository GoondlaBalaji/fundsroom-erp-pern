import { Router } from 'express';
import { QuotationController } from './quotation.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createQuotationSchema, updateQuotationStatusSchema } from './quotation.validation';

const router = Router();

router.use(authenticate);
router.get('/', QuotationController.getAll);
router.get('/:id', QuotationController.getById);
router.post('/', validate(createQuotationSchema), QuotationController.create);
router.patch('/:id/status', validate(updateQuotationStatusSchema), QuotationController.updateStatus);
router.post('/:id/convert', QuotationController.convert);

export default router;
