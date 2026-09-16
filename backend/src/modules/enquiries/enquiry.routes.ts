import { Router } from 'express';
import { EnquiryController } from './enquiry.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createEnquirySchema, updateEnquiryStatusSchema } from './enquiry.validation';

const router = Router();

router.use(authenticate);
router.get('/', EnquiryController.getAll);
router.get('/:id', EnquiryController.getById);
router.post('/', validate(createEnquirySchema), EnquiryController.create);
router.patch('/:id/status', validate(updateEnquiryStatusSchema), EnquiryController.updateStatus);

export default router;
