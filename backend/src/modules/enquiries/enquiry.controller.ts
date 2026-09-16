import { Request, Response, NextFunction } from 'express';
import { EnquiryService } from './enquiry.service';
import { sendSuccess } from '../../utils/response';

export class EnquiryController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const enquiries = await EnquiryService.getAll();
      return sendSuccess(res, enquiries, 'Enquiries retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const enquiry = await EnquiryService.getById(req.params.id);
      return sendSuccess(res, enquiry, 'Enquiry retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const enquiry = await EnquiryService.create(req.body, req.user!.userId);
      return sendSuccess(res, enquiry, 'Enquiry created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const enquiry = await EnquiryService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, enquiry, 'Enquiry status updated successfully');
    } catch (error) {
      next(error);
    }
  }
}
