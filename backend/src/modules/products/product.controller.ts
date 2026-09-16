import { Request, Response, NextFunction } from 'express';
import { ProductService } from './product.service';
import { sendSuccess } from '../../utils/response';

export class ProductController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const products = await ProductService.getAll();
      return sendSuccess(res, products, 'Products retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await ProductService.getById(req.params.id);
      return sendSuccess(res, product, 'Product retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
