import { Request, Response, NextFunction } from 'express';
import { QuotationService } from './quotation.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { hashRequestPayload } from '../../utils/idempotencyHash';
import { sendSuccess } from '../../utils/response';
import prisma from '../../config/prisma';

export class QuotationController {
  static async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const quotations = await QuotationService.getAll();
      return sendSuccess(res, quotations, 'Quotations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const quotation = await QuotationService.getById(req.params.id);
      return sendSuccess(res, quotation, 'Quotation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Without Idempotency-Key: preserve existing behavior unchanged
      if (!idempotencyKey) {
        const quotation = await QuotationService.create(req.body, req.user!.userId);
        return sendSuccess(res, quotation, 'Quotation created successfully', 201);
      }

      const userId = req.user!.userId;
      const method = req.method;
      // Use full mounted path, trim trailing slash for canonical storage
      const rawPath = req.baseUrl + req.path;
      const path = rawPath.endsWith('/') && rawPath.length > 1
        ? rawPath.slice(0, -1)
        : rawPath;

      // Build canonical fingerprint from actual business input fields only.
      //
      // Included:  enquiryId, validUntil (normalized to YYYY-MM-DD), items
      //            (each item: discountPct, gstPct, productId, quantity, unitPrice)
      //
      // Excluded:  clientGrandTotal — this is a client-supplied hint used only
      //            for tamper detection; the server recalculates authoritatively.
      //            Including it would make the fingerprint unstable when clients
      //            omit the field on retry. The tamper check still runs inside
      //            createInTx regardless of idempotency.
      //
      //            quotationNumber, id, createdAt, updatedAt — all server-generated.
      //            JWT, Authorization header — auth fields, never fingerprinted.
      //
      // Item ordering: ORDER-SENSITIVE. Same products in a different order are
      // treated as a distinct request (consistent with enquiry idempotency).
      const { enquiryId, validUntil, items } = req.body;

      const fingerprintItems = (items ?? []).map(
        (item: {
          productId: string;
          quantity: number;
          unitPrice: number;
          discountPct: number;
          gstPct: number;
        }) => ({
          discountPct: item.discountPct,
          gstPct: item.gstPct,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })
      );

      const fingerprint = {
        enquiryId,
        items: fingerprintItems,
        // Normalize validUntil to YYYY-MM-DD so that equivalent dates expressed
        // with different time components (e.g. T00:00:00Z vs T12:00:00+05:30)
        // hash identically.
        validUntil: new Date(validUntil).toISOString().slice(0, 10),
      };
      const payloadHash = hashRequestPayload(fingerprint);

      // Execute claim + business creation inside one atomic transaction.
      // If any step fails the whole transaction rolls back — including the
      // PROCESSING record — leaving the key available for a legitimate retry.
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
          // Exact retry — replay stored response, do NOT create another quotation
          result = {
            status: claim.responseStatus!,
            body: JSON.parse(claim.responseBody!),
          };
          return;
        }

        // First request: create quotation within the same transaction
        const quotation = await QuotationService.createInTx(tx, req.body, userId);

        const responseBody = {
          success: true,
          message: 'Quotation created successfully',
          data: quotation,
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
      const quotation = await QuotationService.updateStatus(req.params.id, req.body.status);
      return sendSuccess(res, quotation, 'Quotation status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async convert(req: Request, res: Response, next: NextFunction) {
    try {
      const salesOrder = await QuotationService.convertToSalesOrder(req.params.id, req.user!.userId);
      return sendSuccess(res, salesOrder, 'Quotation successfully converted to Sales Order', 201);
    } catch (error) {
      next(error);
    }
  }
}
