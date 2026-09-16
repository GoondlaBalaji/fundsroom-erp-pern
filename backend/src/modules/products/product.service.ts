import prisma from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

export class ProductService {
  static async getAll() {
    return prisma.product.findMany({
      orderBy: { code: 'asc' },
      include: {
        inventory: true,
      },
    });
  }

  static async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundError(`Product with ID ${id} not found`);
    }

    return product;
  }
}
