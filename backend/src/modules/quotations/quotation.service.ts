import prisma from '../../config/prisma';
import { QuotationStatus, SalesOrderStatus, EnquiryStatus } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { calculateQuotationTotals, CalculationItemInput } from '../../utils/calculator';

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
    // 1. Fetch enquiry to link customer
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: data.enquiryId },
      include: { customer: true },
    });

    if (!enquiry) {
      throw new NotFoundError(`Enquiry with ID ${data.enquiryId} not found`);
    }

    // 2. Authoritative backend calculation
    const calc = calculateQuotationTotals(data.items);

    // Optional check: if client sent a grand total and it significantly disagrees, reject or log tampering
    if (data.clientGrandTotal !== undefined && Math.abs(data.clientGrandTotal - calc.grandTotal) > 0.05) {
      throw new ValidationError(
        `Quotation total discrepancy detected. Client: ₹${data.clientGrandTotal}, Authoritative Backend Total: ₹${calc.grandTotal}`
      );
    }

    // 3. Generate unique quotation number: QTN-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.quotation.count({
      where: {
        quotationNumber: {
          startsWith: `QTN-${dateStr}`,
        },
      },
    });
    const seq = String(countToday + 1).padStart(4, '0');
    const quotationNumber = `QTN-${dateStr}-${seq}`;

    // 4. Save quotation and items transactionally
    return prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.create({
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

      return quotation;
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
      // 1. Lock quotation row using row-level locking
      const lockedQuotations: { id: string; status: QuotationStatus; quotation_number: string }[] = await tx.$queryRawUnsafe(
        `SELECT id, status, quotation_number FROM quotations WHERE id = $1 FOR UPDATE`,
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

      // 5. Generate unique Sales Order number: SO-YYYYMMDD-XXXX
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = await tx.salesOrder.count({
        where: {
          orderNumber: {
            startsWith: `SO-${dateStr}`,
          },
        },
      });
      const seq = String(countToday + 1).padStart(4, '0');
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
