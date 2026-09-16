import { Request, Response, NextFunction } from 'express';
import { DispatchService } from './dispatch.service';
import { sendSuccess } from '../../utils/response';

export class DispatchController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const dispatches = await DispatchService.getAll();
      return sendSuccess(res, dispatches, 'Dispatch records retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const dispatch = await DispatchService.getById(req.params.id);
      return sendSuccess(res, dispatch, 'Dispatch record retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async process(req: Request, res: Response, next: NextFunction) {
    try {
      const dispatch = await DispatchService.processDispatch(req.body, req.user!.userId);
      return sendSuccess(res, dispatch, 'Order dispatched and inventory updated successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}
