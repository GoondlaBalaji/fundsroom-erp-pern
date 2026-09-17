import prisma from '../../config/prisma';
import { Prisma, QuotationStatus, SalesOrderStatus, EnquiryStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { calculateQuotationTotals, CalculationItemInput } from '../../utils/calculator';
import { nextSequence, todayKey } from '../../utils/sequence';

export interface CreateQuotationItemDTO extends CalculationItemInput {
  clientLineAmount?: number;
}

export interface CreateQuotationDTO {
  enquiryId: string;
  validUntil: string;
  items: CreateQuotationItemDTO[];
  clientGrandTotal?: number;
}

export class QuotationService {
  static async getAll() {
    return prisma.quotation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        enquiry: {
          select: { id: true, enquiryNumber: true, status: true },
        },
        customer: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
        salesOrder: {
          select: { id: true, orderNumber: true, status: true, totalAmount: true },
        },
      },
    });
  }

  static async getById(id: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        enquiry: true,
        customer: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: { product: true },
        },
        salesOrder: {
          include: {
            items: { include: { product: true } },
            dispatch: true,
          },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundError(`Quotation with ID ${id} not found`);
    }

    return quotation;
  }

  static async create(data: CreateQuotationDTO, userId: string) {
    return QuotationService.createInTx(prisma, data, userId);
  }

  /**
   * Create a quotation + items within a supplied Prisma client/transaction.
   * Used by the idempotency-aware controller to coordinate inside one transaction.
   *
   * All financial validation (tamper detection, authoritative calculation) is
   * performed here regardless of whether the caller is the idempotent or
   * non-idempotent path. The backend remains authoritative for all totals.
   */
  static async createInTx(
    tx: Prisma.TransactionClient | typeof prisma,
    data: CreateQuotationDTO,
    userId: string
  ) {
    const client = tx as Prisma.TransactionClient;

    // 1. Fetch enquiry to link customer and validate status
    const enquiry = await client.enquiry.findUnique({
      where: { id: data.enquiryId },
      include: { customer: true },
    });

    if (!enquiry) {
      throw new NotFoundError(`Enquiry with ID ${data.enquiryId} not found`);
    }

    // BUG-06 FIX: Block quotation creation for LOST or WON enquiries.
    if (enquiry.status === EnquiryStatus.LOST) {
      throw new ValidationError(
        `Cannot generate quotation for an enquiry with status 'LOST'`
      );
    }
    if (enquiry.status === EnquiryStatus.WON) {
      throw new ValidationError(
        `Cannot generate quotation for an enquiry with status 'WON'. The enquiry has already been converted to a Sales Order.`
      );
    }

    // 2. Authoritative backend calculation — never trusts client totals
    const calc = calculateQuotationTotals(data.items);

    // Tamper detection: if client sent a grand total and it significantly disagrees, reject
    if (data.clientGrandTotal !== undefined && Math.abs(data.clientGrandTotal - calc.grandTotal) > 0.05) {
      throw new ValidationError(
        `Quotation total discrepancy detected. Client: ₹${data.clientGrandTotal}, Authoritative Backend Total: ₹${calc.grandTotal}`
      );
    }

    // 3. Atomic sequence allocation inside the transaction
    // BUG-08 FIX: concurrent-safe document number generation
    const dateStr = todayKey();
    const seq = await nextSequence(client, 'QTN', dateStr);
    const quotationNumber = `QTN-${dateStr}-${seq}`;

    return client.quotation.create({
      data: {
        quotationNumber,
        enquiryId: enquiry.id,
        customerId: enquiry.customerId,
        validUntil: new Date(data.validUntil),
        subtotal: calc.subtotal,
        totalDiscount: calc.totalDiscount,
        totalGst: calc.totalGst,
        grandTotal: calc.grandTotal,
        status: QuotationStatus.DRAFT,
        createdById: userId,
        items: {
          create: calc.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct,
            gstPct: item.gstPct,
            baseAmount: item.baseAmount,
            discountAmount: item.discountAmount,
            netAmount: item.netAmount,
            gstAmount: item.gstAmount,
            lineAmount: item.lineAmount,
          })),
        },
      },
      include: {
        customer: true,
        enquiry: true,
        items: {
          include: { product: true },
        },
      },
    });
  }

  static async updateStatus(id: string, newStatus: QuotationStatus) {
    return prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({
        where: { id },
        include: { enquiry: true, salesOrder: true },
      });

      if (!quotation) {
        throw new NotFoundError(`Quotation with ID ${id} not found`);
      }

      if (quotation.salesOrder) {
        throw new ConflictError(
          'Cannot modify status of a quotation that has already been converted to a Sales Order'
        );
      }

      const updated = await tx.quotation.update({
        where: { id },
        data: { status: newStatus },
        include: {
          customer: true,
          enquiry: true,
          items: { include: { product: true } },
        },
      });

      // Update linked enquiry status if transitioning to SENT or ACCEPTED
      if (
        (newStatus === QuotationStatus.SENT || newStatus === QuotationStatus.ACCEPTED) &&
        quotation.enquiry.status === EnquiryStatus.NEW
      ) {
        await tx.enquiry.update({
          where: { id: quotation.enquiryId },
          data: { status: EnquiryStatus.QUOTED },
        });
      }

      return updated;
    });
  }

  static async convertToSalesOrder(id: string, _userId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock quotation row AND fetch valid_until in the same raw query
      const lockedQuotations: {
        id: string;
        status: QuotationStatus;
        quotation_number: string;
        valid_until: Date;
        enquiry_id: string;
      }[] = await tx.$queryRawUnsafe(
        `SELECT id, status, quotation_number, valid_until, enquiry_id FROM quotations WHERE id = $1 FOR UPDATE`,
        id
      );

      if (!lockedQuotations || lockedQuotations.length === 0) {
        throw new NotFoundError(`Quotation with ID ${id} not found`);
      }

      const lockedQuotation = lockedQuotations[0];

      // 2. Strict Rule: Only ACCEPTED quotations can be converted
      if (lockedQuotation.status !== QuotationStatus.ACCEPTED) {
        throw new ValidationError(
          `Cannot convert quotation to Sales Order. Quotation must be in ACCEPTED status, but is currently '${lockedQuotation.status}'.`
        );
      }

      // BUG-04 FIX: Check expiry against the locked row's valid_until.
      // Using new Date() here is safe because valid_until is a past/future boundary check,
      // not an equality comparison, and is checked against the authoritative DB value under lock.
      const now = new Date();
      const validUntil = new Date(lockedQuotation.valid_until);
      if (now > validUntil) {
        throw new ValidationError(
          `Cannot convert quotation to Sales Order. The quotation expired on ${validUntil.toISOString().slice(0, 10)} and is no longer valid.`
        );
      }

      // 3. Strict Rule: Check if a Sales Order already exists for this quotation (1:1 constraint)
      const existing = await tx.salesOrder.findUnique({
        where: { quotationId: id },
      });
      if (existing) {
        throw new ConflictError(
          `A Sales Order (${existing.orderNumber}) has already been generated for this quotation.`
        );
      }

      // 4. Fetch full quotation with items
      const quotation = await tx.quotation.findUnique({
        where: { id },
        include: {
          items: true,
          enquiry: true,
        },
      });

      if (!quotation) {
        throw new NotFoundError(`Quotation with ID ${id} not found`);
      }

      // 5. BUG-08 FIX: Generate unique Sales Order number atomically
      const dateStr = todayKey();
      const seq = await nextSequence(tx, 'SO', dateStr);
      const orderNumber = `SO-${dateStr}-${seq}`;

      const salesOrder = await tx.salesOrder.create({
        data: {
          orderNumber,
          quotationId: quotation.id,
          customerId: quotation.customerId,
          totalAmount: quotation.grandTotal,
          status: SalesOrderStatus.PENDING,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineAmount: item.lineAmount,
            })),
          },
        },
        include: {
          customer: true,
          quotation: true,
          items: {
            include: { product: true },
          },
        },
      });

      // Mark enquiry as WON
      await tx.enquiry.update({
        where: { id: quotation.enquiryId },
        data: { status: EnquiryStatus.WON },
      });

      return salesOrder;
    });
  }
}
