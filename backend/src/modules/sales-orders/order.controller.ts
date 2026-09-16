import { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service';
import { sendSuccess } from '../../utils/response';

export class OrderController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await OrderService.getAll();
      return sendSuccess(res, orders, 'Sales orders retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await OrderService.getById(req.params.id);
      return sendSuccess(res, order, 'Sales order retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const confirmedOrder = await OrderService.confirmAndReserve(req.params.id, req.user!.userId);
      return sendSuccess(res, confirmedOrder, 'Sales Order confirmed and stock successfully reserved');
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const cancelledOrder = await OrderService.cancelOrder(req.params.id);
      return sendSuccess(res, cancelledOrder, 'Sales Order cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
}
