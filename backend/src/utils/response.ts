import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode: number = 200) {
  return res.status(statusCode).json({
    success: true,
    message: message || 'Operation completed successfully',
    data,
  });
}

export function sendError(res: Response, message: string, statusCode: number = 400, details?: any) {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      details,
    },
  });
}
