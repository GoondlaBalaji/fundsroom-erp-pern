import prisma from '../../config/prisma';

export class InventoryService {
  static async getAll() {
    const inventories = await prisma.inventory.findMany({
      include: {
        product: true,
      },
      orderBy: {
        product: { code: 'asc' },
      },
    });

    return inventories.map((inv) => {
      // BUG-12 FIX: Report the true available quantity without masking.
      // Math.max(0, ...) previously hid data-integrity defects (e.g. when
      // damaged_quantity pushes availability negative despite the
      // reserved_quantity <= physical_quantity DB constraint).
      const availableQuantity = inv.physicalQuantity - inv.reservedQuantity - inv.damagedQuantity;
      return {
        id: inv.id,
        productId: inv.productId,
        productCode: inv.product.code,
        productName: inv.product.name,
        category: inv.product.category,
        unit: inv.product.unit,
        basePrice: inv.product.basePrice,
        physicalQuantity: inv.physicalQuantity,
        reservedQuantity: inv.reservedQuantity,
        damagedQuantity: inv.damagedQuantity,
        availableQuantity,
        updatedAt: inv.updatedAt,
      };
    });
  }

  static async getByProductId(productId: string) {
    const inv = await prisma.inventory.findUnique({
      where: { productId },
      include: { product: true },
    });

    if (!inv) return null;

    return {
      id: inv.id,
      productId: inv.productId,
      productCode: inv.product.code,
      productName: inv.product.name,
      physicalQuantity: inv.physicalQuantity,
      reservedQuantity: inv.reservedQuantity,
      damagedQuantity: inv.damagedQuantity,
      // BUG-12 FIX: Report true calculated value without masking.
      availableQuantity: inv.physicalQuantity - inv.reservedQuantity - inv.damagedQuantity,
      updatedAt: inv.updatedAt,
    };
  }
}
