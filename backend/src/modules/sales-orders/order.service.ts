import prisma from '../../config/prisma';
import { SalesOrderStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';

interface LockedInventoryRow {
  id: string;
  product_id: string;
  physical_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
}

export class OrderService {
  static async getAll() {
    const orders = await prisma.salesOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        quotation: {
          select: { id: true, quotationNumber: true, enquiryId: true },
        },
        confirmedBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: {
              include: {
                inventory: true,
              },
            },
          },
        },
        dispatches: {
          include: {
            items: true,
            dispatchedBy: {
              select: { id: true, fullName: true },
            },
          },
        },
      },
    });

    // Compute live inventory availability indicator for each item
    return orders.map((order) => {
      const itemsWithStock = order.items.map((item) => {
        const inv = item.product.inventory;
        const physical = inv ? inv.physicalQuantity : 0;
        const reserved = inv ? inv.reservedQuantity : 0;
        const damaged = inv ? inv.damagedQuantity : 0;
        const available = Math.max(0, physical - reserved - damaged);
        const hasSufficientStock = available >= item.quantity;

        return {
          id: item.id,
          productId: item.productId,
          productCode: item.product.code,
          productName: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineAmount: item.lineAmount,
          inventoryStatus: {
            physical,
            reserved,
            available,
            hasSufficientStock,
          },
        };
      });

      return {
        ...order,
        items: itemsWithStock,
      };
    });
  }

  static async getById(id: string) {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: {
          include: {
            enquiry: true,
          },
        },
        confirmedBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: {
              include: { inventory: true },
            },
          },
        },
        dispatches: {
          include: {
            items: { include: { product: true } },
            dispatchedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Sales Order with ID ${id} not found`);
    }

    return order;
  }

  /**
   * Confirms a Sales Order and Reserves Inventory.
   * Concurrency-safe via PostgreSQL pessimistic row-level locking (SELECT ... FOR UPDATE).
   * Physical inventory remains unchanged; Reserved inventory is incremented.
   */
  static async confirmAndReserve(id: string, adminUserId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch the Sales Order with items
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundError(`Sales Order with ID ${id} not found`);
      }

      // 2. Validate current status
      if (order.status === SalesOrderStatus.CONFIRMED) {
        throw new ConflictError(`Sales Order ${order.orderNumber} is already confirmed and reserved.`);
      }

      if (order.status === SalesOrderStatus.DISPATCHED) {
        throw new ValidationError(`Sales Order ${order.orderNumber} has already been dispatched.`);
      }

      if (order.status === SalesOrderStatus.CANCELLED) {
        throw new ValidationError(`Sales Order ${order.orderNumber} is cancelled and cannot be confirmed.`);
      }

      if (order.status !== SalesOrderStatus.PENDING) {
        throw new ValidationError(`Sales Order status must be PENDING to confirm, but is '${order.status}'.`);
      }

      // 3. Acquire pessimistic row-level locks on inventory rows in deterministic ascending order
      const sortedProductIds = [...new Set(order.items.map((i) => i.productId))].sort();

      const lockedInventories: LockedInventoryRow[] = await tx.$queryRawUnsafe(
        `SELECT id, product_id, physical_quantity, reserved_quantity, damaged_quantity
         FROM inventories
         WHERE product_id = ANY($1::text[])
         ORDER BY product_id ASC
         FOR UPDATE`,
        sortedProductIds
      );

      const inventoryMap = new Map<string, LockedInventoryRow>();
      for (const row of lockedInventories) {
        inventoryMap.set(row.product_id, row);
      }

      // 4. Validate stock availability for all items under the locked rows
      for (const item of order.items) {
        const inv = inventoryMap.get(item.productId);
        if (!inv) {
          throw new NotFoundError(`Inventory record missing for product '${item.product.name}'`);
        }

        const available = inv.physical_quantity - inv.reserved_quantity - inv.damaged_quantity;

        if (available < item.quantity) {
          throw new ConflictError(
            `Insufficient stock for '${item.product.name}' (${item.product.code}). Required: ${item.quantity}, Available: ${Math.max(0, available)} (Physical: ${inv.physical_quantity}, Reserved: ${inv.reserved_quantity})`
          );
        }
      }

      // 5. Reserve stock: increment reserved_quantity; physical_quantity remains untouched
      for (const item of order.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: {
            reservedQuantity: {
              increment: item.quantity,
            },
          },
        });
      }

      // 6. Update order status to CONFIRMED
      const confirmedOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          status: SalesOrderStatus.CONFIRMED,
          confirmedById: adminUserId,
          confirmedAt: new Date(),
        },
        include: {
          customer: true,
          items: {
            include: { product: true },
          },
        },
      });

      return confirmedOrder;
    });
  }

  /**
   * Live-change readiness: Cancel Sales Order and safely release reserved stock if confirmed.
   */
  static async cancelOrder(id: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundError(`Sales Order with ID ${id} not found`);
      }

      if (order.status === SalesOrderStatus.DISPATCHED) {
        throw new ValidationError('Cannot cancel an already dispatched Sales Order.');
      }

      if (order.status === SalesOrderStatus.CANCELLED) {
        throw new ConflictError('Sales Order is already cancelled.');
      }

      // If the order was confirmed, release reserved stock
      if (order.status === SalesOrderStatus.CONFIRMED) {
        const sortedProductIds = [...new Set(order.items.map((i) => i.productId))].sort();

        // Lock inventory rows before release
        await tx.$queryRawUnsafe(
          `SELECT id, product_id, reserved_quantity
           FROM inventories
           WHERE product_id = ANY($1::text[])
           ORDER BY product_id ASC
           FOR UPDATE`,
          sortedProductIds
        );

        for (const item of order.items) {
          await tx.inventory.update({
            where: { productId: item.productId },
            data: {
              reservedQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      const cancelledOrder = await tx.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.CANCELLED },
        include: { customer: true, items: true },
      });

      return cancelledOrder;
    });
  }
}
