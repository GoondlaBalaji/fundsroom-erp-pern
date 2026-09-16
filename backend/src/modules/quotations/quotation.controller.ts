import { Request, Response, NextFunction } from 'express';
import { QuotationService } from './quotation.service';
import { sendSuccess } from '../../utils/response';

export class QuotationController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const quotations = await QuotationService.getAll();
      return sendSuccess(res, quotations, 'Quotations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const quotation = await QuotationService.getById(req.params.id);
      return sendSuccess(res, quotation, 'Quotation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const quotation = await QuotationService.create(req.body, req.user!.userId);
      return sendSuccess(res, quotation, 'Quotation created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const quotation = await QuotationService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, quotation, 'Quotation status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async convert(req: Request, res: Response, next: NextFunction) {
    try {
      const salesOrder = await QuotationService.convertToSalesOrder(req.params.id, req.user!.userId);
      return sendSuccess(res, salesOrder, 'Quotation successfully converted to Sales Order', 201);
    } catch (error) {
      next(error);
    }
  }
}
