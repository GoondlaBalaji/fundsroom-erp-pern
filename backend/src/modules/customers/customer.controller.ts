import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service';
import { sendSuccess } from '../../utils/response';

export class CustomerController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const customers = await CustomerService.getAll();
      return sendSuccess(res, customers, 'Customers retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomerService.getById(req.params.id);
      return sendSuccess(res, customer, 'Customer retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomerService.create(req.body);
      return sendSuccess(res, customer, 'Customer created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}
