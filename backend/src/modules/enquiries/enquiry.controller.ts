import { Request, Response, NextFunction } from 'express';
import { EnquiryService } from './enquiry.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { hashRequestPayload } from '../../utils/idempotencyHash';
import { sendSuccess } from '../../utils/response';
import prisma from '../../config/prisma';

export class EnquiryController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const enquiries = await EnquiryService.getAll();
      return sendSuccess(res, enquiries, 'Enquiries retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const enquiry = await EnquiryService.getById(req.params.id);
      return sendSuccess(res, enquiry, 'Enquiry retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Without Idempotency-Key: preserve existing behavior unchanged
      if (!idempotencyKey) {
        const enquiry = await EnquiryService.create(req.body, req.user!.userId);
        return sendSuccess(res, enquiry, 'Enquiry created successfully', 201);
      }

      const userId = req.user!.userId;
      const method = req.method;
      // Use the full path (base + sub-path) so the idempotency key is stable
      // regardless of where this router is mounted. req.path alone would be
      // "/" when the router is mounted at /api/enquiries.
      // Trim trailing slash to keep the stored path canonical ("/api/enquiries"
      // rather than "/api/enquiries/").
      const rawPath = req.baseUrl + req.path;
      const path = rawPath.endsWith('/') && rawPath.length > 1
        ? rawPath.slice(0, -1)
        : rawPath;

      // Build a canonical fingerprint of the business creation payload.
      //
      // Item ordering strategy: enquiry items are ORDER-SENSITIVE (the API
      // accepts a client-ordered list and preserves insertion order). Two
      // requests with the same products in different order are treated as
      // different fingerprints — they will create independent enquiries unless
      // the exact same ordered list is replayed under the same key.
      //
      // requiredDate is normalized to YYYY-MM-DD (date-only) so that
      // equivalent dates expressed with different time components hash equally.
      //
      // Excludes all server-generated fields (enquiry number, id, timestamps).
      const { customerId, requiredDate, notes, items } = req.body;
      const fingerprintItems = (items ?? []).map(
        (item: { productId: string; quantity: number }) => ({
          productId: item.productId,
          quantity: item.quantity,
        })
      );
      const fingerprint = {
        customerId,
        items: fingerprintItems,
        notes: notes ?? null,
        requiredDate: new Date(requiredDate).toISOString().slice(0, 10),
      };
      const payloadHash = hashRequestPayload(fingerprint);

      // Execute claim + business creation inside one atomic transaction.
      // Rollback on business failure also rolls back the PROCESSING record.
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
          // Exact retry — replay stored response, do NOT create another enquiry
          result = {
            status: claim.responseStatus!,
            body: JSON.parse(claim.responseBody!),
          };
          return;
        }

        // First request: create enquiry + items within the transaction
        const enquiry = await EnquiryService.createInTx(tx, req.body, userId);
        const responseBody = {
          success: true,
          message: 'Enquiry created successfully',
          data: enquiry,
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

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const enquiry = await EnquiryService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, enquiry, 'Enquiry status updated successfully');
    } catch (error) {
      next(error);
    }
  }
}
