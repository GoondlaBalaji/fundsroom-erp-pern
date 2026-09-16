import prisma from '../../config/prisma';
import { EnquiryStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../utils/errors';

export interface CreateEnquiryItemDTO {
  productId: string;
  quantity: number;
}

export interface CreateEnquiryDTO {
  customerId: string;
  requiredDate: string;
  notes?: string;
  items: CreateEnquiryItemDTO[];
}

export class EnquiryService {
  static async getAll() {
    return prisma.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
        quotations: {
          select: { id: true, quotationNumber: true, status: true, grandTotal: true },
        },
      },
    });
  }

  static async getById(id: string) {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            product: true,
          },
        },
        quotations: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!enquiry) {
      throw new NotFoundError(`Enquiry with ID ${id} not found`);
    }

    return enquiry;
  }

  static async create(data: CreateEnquiryDTO, userId: string) {
    // 1. Validate customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) {
      throw new NotFoundError('Selected customer does not exist');
    }

    // 2. Validate all products exist
    const productIds = data.items.map((i) => i.productId);
    const existingProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (existingProducts.length !== productIds.length) {
      throw new ValidationError('One or more selected products are invalid or do not exist');
    }

    // 3. Generate unique enquiry number: ENQ-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.enquiry.count({
      where: {
        enquiryNumber: {
          startsWith: `ENQ-${dateStr}`,
        },
      },
    });
    const seq = String(countToday + 1).padStart(4, '0');
    const enquiryNumber = `ENQ-${dateStr}-${seq}`;

    // 4. Create enquiry + items transactionally
    return prisma.$transaction(async (tx) => {
      return tx.enquiry.create({
        data: {
          enquiryNumber,
          customerId: data.customerId,
          requiredDate: new Date(data.requiredDate),
          notes: data.notes || null,
          status: EnquiryStatus.NEW,
          createdById: userId,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          customer: true,
          items: {
            include: { product: true },
          },
        },
      });
    });
  }

  static async updateStatus(id: string, newStatus: EnquiryStatus) {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id },
    });

    if (!enquiry) {
      throw new NotFoundError(`Enquiry with ID ${id} not found`);
    }

    // Enforce business state transitions
    // NEW -> QUOTED, LOST
    // QUOTED -> WON, LOST
    if (enquiry.status === EnquiryStatus.WON && newStatus !== EnquiryStatus.WON) {
      throw new ValidationError('A WON enquiry cannot change status');
    }

    return prisma.enquiry.update({
      where: { id },
      data: { status: newStatus },
      include: { customer: true, items: true },
    });
  }
}
