import prisma from '../../config/prisma';
import { SalesOrderStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { nextSequence, todayKey } from '../../utils/sequence';

interface LockedInventoryRow {
  id: string;
  product_id: string;
  physical_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
}

export interface CreateDispatchDTO {
  salesOrderId: string;
  vehicleNumber: string;
  driverName: string;
}

export class DispatchService {
  static async getAll() {
    return prisma.dispatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        salesOrder: {
          include: {
            customer: true,
          },
        },
        dispatchedBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  static async getById(id: string) {
    const dispatch = await prisma.dispatch.findUnique({
      where: { id },
      include: {
        salesOrder: {
          include: {
            customer: true,
            items: { include: { product: true } },
          },
        },
        dispatchedBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: { product: true },
        },
      },
    });

    if (!dispatch) {
      throw new NotFoundError(`Dispatch record with ID ${id} not found`);
    }

    return dispatch;
  }

  /**
   * Processes a Dispatch for a confirmed Sales Order.
   * Atomically decrements both physicalQuantity AND reservedQuantity.
   * Enforces that reservedQuantity and physicalQuantity do not go below zero.
   */
  static async processDispatch(data: CreateDispatchDTO, adminUserId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock sales order row using row-level locking
      const lockedOrders: { id: string; status: SalesOrderStatus; order_number: string }[] = await tx.$queryRawUnsafe(
        `SELECT id, status, order_number FROM sales_orders WHERE id = $1 FOR UPDATE`,
        data.salesOrderId
      );

      if (!lockedOrders || lockedOrders.length === 0) {
        throw new NotFoundError(`Sales Order with ID ${data.salesOrderId} not found`);
      }

      const lockedOrder = lockedOrders[0];

      // 2. Validate order status under the lock
      if (lockedOrder.status === SalesOrderStatus.PENDING) {
        throw new ValidationError('Cannot dispatch an unconfirmed Sales Order. Please confirm and reserve stock first.');
      }

      if (lockedOrder.status === SalesOrderStatus.DISPATCHED) {
        throw new ConflictError(`Sales Order ${lockedOrder.order_number} has already been dispatched.`);
      }

      if (lockedOrder.status === SalesOrderStatus.CANCELLED) {
        throw new ValidationError(`Cannot dispatch a cancelled Sales Order.`);
      }

      if (lockedOrder.status !== SalesOrderStatus.CONFIRMED) {
        throw new ValidationError(`Order status must be CONFIRMED to dispatch, but is '${lockedOrder.status}'.`);
      }

      // Check if dispatch record already exists (1:1 constraint)
      const existingDispatch = await tx.dispatch.findUnique({
        where: { salesOrderId: data.salesOrderId },
      });
      if (existingDispatch) {
        throw new ConflictError(`Sales Order ${lockedOrder.order_number} has already been dispatched.`);
      }

      // 3. Fetch full items for the order
      const order = await tx.salesOrder.findUnique({
        where: { id: data.salesOrderId },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundError(`Sales Order with ID ${data.salesOrderId} not found`);
      }

      // 4. Acquire pessimistic row locks on inventory rows
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

      // 4. Validate stock reductions
      for (const item of order.items) {
        const inv = inventoryMap.get(item.productId);
        if (!inv) {
          throw new NotFoundError(`Inventory record missing for product '${item.product.name}'`);
        }

        if (inv.reserved_quantity < item.quantity) {
          throw new ConflictError(
            `Cannot dispatch: Required reserved quantity (${item.quantity}) exceeds currently reserved stock (${inv.reserved_quantity}) for product '${item.product.name}'.`
          );
        }

        if (inv.physical_quantity < item.quantity) {
          throw new ConflictError(
            `Cannot dispatch: Required physical quantity (${item.quantity}) exceeds physical stock on hand (${inv.physical_quantity}) for product '${item.product.name}'.`
          );
        }
      }

      // 5. Decrement BOTH physical AND reserved inventory atomically
      for (const item of order.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: {
            physicalQuantity: {
              decrement: item.quantity,
            },
            reservedQuantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      // 6. BUG-08 FIX: Generate unique dispatch number atomically
      const dateStr = todayKey();
      const seq = await nextSequence(tx, 'DSP', dateStr);
      const dispatchNumber = `DSP-${dateStr}-${seq}`;

      // 7. Create Dispatch record and line items
      const dispatch = await tx.dispatch.create({
        data: {
          dispatchNumber,
          salesOrderId: order.id,
          vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
          driverName: data.driverName.trim(),
          dispatchedById: adminUserId,
          items: {
            create: order.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          salesOrder: {
            include: { customer: true },
          },
          items: {
            include: { product: true },
          },
        },
      });

      // 8. Update Sales Order status to DISPATCHED
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { status: SalesOrderStatus.DISPATCHED },
      });

      return dispatch;
    });
  }
}
