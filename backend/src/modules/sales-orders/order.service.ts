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
        dispatch: {
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
        dispatch: {
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
      // 1. Lock the sales order row using row-level locking to prevent same-order race conditions
      const lockedOrders: { id: string; status: SalesOrderStatus; order_number: string }[] = await tx.$queryRawUnsafe(
        `SELECT id, status, order_number FROM sales_orders WHERE id = $1 FOR UPDATE`,
        id
      );

      if (!lockedOrders || lockedOrders.length === 0) {
        throw new NotFoundError(`Sales Order with ID ${id} not found`);
      }

      const lockedOrder = lockedOrders[0];

      // 2. Validate current status under the acquired row lock
      if (lockedOrder.status === SalesOrderStatus.CONFIRMED) {
        throw new ConflictError(`Sales Order ${lockedOrder.order_number} is already confirmed and reserved.`);
      }

      if (lockedOrder.status === SalesOrderStatus.DISPATCHED) {
        throw new ValidationError(`Sales Order ${lockedOrder.order_number} has already been dispatched.`);
      }

      if (lockedOrder.status === SalesOrderStatus.CANCELLED) {
        throw new ValidationError(`Sales Order ${lockedOrder.order_number} is cancelled and cannot be confirmed.`);
      }

      if (lockedOrder.status !== SalesOrderStatus.PENDING) {
        throw new ValidationError(`Sales Order status must be PENDING to confirm, but is '${lockedOrder.status}'.`);
      }

      // 3. Fetch full items for the locked order
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
      // 1. Lock sales order row using row-level locking
      const lockedOrders: { id: string; status: SalesOrderStatus; order_number: string }[] = await tx.$queryRawUnsafe(
        `SELECT id, status, order_number FROM sales_orders WHERE id = $1 FOR UPDATE`,
        id
      );

      if (!lockedOrders || lockedOrders.length === 0) {
        throw new NotFoundError(`Sales Order with ID ${id} not found`);
      }

      const lockedOrder = lockedOrders[0];

      if (lockedOrder.status === SalesOrderStatus.DISPATCHED) {
        throw new ValidationError('Cannot cancel an already dispatched Sales Order.');
      }

      if (lockedOrder.status === SalesOrderStatus.CANCELLED) {
        throw new ConflictError('Sales Order is already cancelled.');
      }

      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundError(`Sales Order with ID ${id} not found`);
      }

      // If the order was confirmed, release reserved stock
      if (lockedOrder.status === SalesOrderStatus.CONFIRMED) {
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
