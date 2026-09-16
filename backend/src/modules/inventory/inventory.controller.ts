import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service';
import { sendSuccess } from '../../utils/response';

export class InventoryController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const inventory = await InventoryService.getAll();
      return sendSuccess(res, inventory, 'Inventory retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
