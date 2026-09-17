import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

export interface CreateCustomerDTO {
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  city: string;
}

type TxClient = Prisma.TransactionClient;

export class CustomerService {
  static async getAll() {
    return prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { enquiries: true, quotations: true, salesOrders: true },
        },
      },
    });
  }

  static async getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        enquiries: true,
        quotations: true,
        salesOrders: true,
      },
    });

    if (!customer) {
      throw new NotFoundError(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  /**
   * Create a customer using the global prisma client (non-idempotent path).
   */
  static async create(data: CreateCustomerDTO) {
    return CustomerService.createInTx(prisma, data);
  }

  /**
   * Create a customer within a supplied Prisma client/transaction.
   * Used by the idempotency-aware controller to keep creation inside the same tx.
   */
  static async createInTx(tx: TxClient | typeof prisma, data: CreateCustomerDTO) {
    return (tx as TxClient).customer.create({
      data: {
        companyName: data.companyName.trim(),
        contactPerson: data.contactPerson.trim(),
        mobile: data.mobile.trim(),
        email: data.email.toLowerCase().trim(),
        city: data.city.trim(),
      },
    });
  }
}