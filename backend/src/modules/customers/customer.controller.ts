import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { hashRequestPayload } from '../../utils/idempotencyHash';
import { sendSuccess } from '../../utils/response';
import prisma from '../../config/prisma';

export class CustomerController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const customers = await CustomerService.getAll();
      return sendSuccess(res, customers, 'Customers retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await CustomerService.getById(req.params.id);
      return sendSuccess(res, customer, 'Customer retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Without Idempotency-Key: preserve existing behavior unchanged
      if (!idempotencyKey) {
        const customer = await CustomerService.create(req.body);
        return sendSuccess(res, customer, 'Customer created successfully', 201);
      }

      const userId = req.user!.userId;
      const method = req.method;
      // Use the full path (base + sub-path) so the idempotency key is stable
      // regardless of where this router is mounted. req.path alone would be
      // "/" when the router is mounted at /api/customers.
      // Trim trailing slash to keep the stored path canonical ("/api/customers"
      // rather than "/api/customers/").
      const rawPath = req.baseUrl + req.path;
      const path = rawPath.endsWith('/') && rawPath.length > 1
        ? rawPath.slice(0, -1)
        : rawPath;

      // Build a canonical fingerprint of the business creation payload.
      // Excludes all server-generated fields (id, timestamps, tokens).
      const { companyName, contactPerson, mobile, email, city } = req.body;
      const fingerprint = { city, companyName, contactPerson, email, mobile };
      const payloadHash = hashRequestPayload(fingerprint);

      // Execute claim + business creation inside one atomic transaction.
      // If the transaction rolls back (business failure), the PROCESSING record
      // is also rolled back — allowing a legitimate retry to proceed.
      let result!: { status: number; body: object };

      await prisma.$transaction(async (tx) => {
        const claim = await IdempotencyService.claimOrReplay(tx, {
          key: idempotencyKey,
          userId,
          method,
          path,
          payloadHash,
        });

        if (!claim.isNew) {
          // Exact retry — replay the stored response, do NOT create another customer
          result = {
            status: claim.responseStatus!,
            body: JSON.parse(claim.responseBody!),
          };
          return;
        }

        // First request: create the customer within the transaction
        const customer = await CustomerService.createInTx(tx, req.body);
        const responseBody = {
          success: true,
          message: 'Customer created successfully',
          data: customer,
        };

        await IdempotencyService.complete(tx, {
          key: idempotencyKey,
          userId,
          method,
          path,
          responseStatus: 201,
          responseBody: JSON.stringify(responseBody),
        });

        result = { status: 201, body: responseBody };
      });

      return res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  }
}
