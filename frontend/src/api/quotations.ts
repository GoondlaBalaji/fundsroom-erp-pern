import { apiClient } from './client';
import { Quotation, QuotationStatus, SalesOrder, ApiResponse } from '../types';

export interface CreateQuotationItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
}

export interface CreateQuotationInput {
  enquiryId: string;
  validUntil: string;
  clientGrandTotal?: number;
  items: CreateQuotationItemInput[];
}

export const quotationApi = {
  getAll: async (): Promise<Quotation[]> => {
    const res = await apiClient.get<ApiResponse<Quotation[]>>('/quotations');
    return res.data.data;
  },

  getById: async (id: string): Promise<Quotation> => {
    const res = await apiClient.get<ApiResponse<Quotation>>(`/quotations/${id}`);
    return res.data.data;
  },

  create: async (data: CreateQuotationInput): Promise<Quotation> => {
    const res = await apiClient.post<ApiResponse<Quotation>>('/quotations', data);
    return res.data.data;
  },

  updateStatus: async (id: string, status: QuotationStatus): Promise<Quotation> => {
    const res = await apiClient.patch<ApiResponse<Quotation>>(`/quotations/${id}/status`, { status });
    return res.data.data;
  },

  convertToSalesOrder: async (id: string): Promise<SalesOrder> => {
    const res = await apiClient.post<ApiResponse<SalesOrder>>(`/quotations/${id}/convert`);
    return res.data.data;
  },
};
