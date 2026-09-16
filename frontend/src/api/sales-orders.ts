import { apiClient } from './client';
import { SalesOrder, ApiResponse } from '../types';

export const salesOrderApi = {
  getAll: async (): Promise<SalesOrder[]> => {
    const res = await apiClient.get<ApiResponse<SalesOrder[]>>('/sales-orders');
    return res.data.data;
  },

  getById: async (id: string): Promise<SalesOrder> => {
    const res = await apiClient.get<ApiResponse<SalesOrder>>(`/sales-orders/${id}`);
    return res.data.data;
  },

  confirmAndReserve: async (id: string): Promise<SalesOrder> => {
    const res = await apiClient.post<ApiResponse<SalesOrder>>(`/sales-orders/${id}/confirm`);
    return res.data.data;
  },

  cancel: async (id: string): Promise<SalesOrder> => {
    const res = await apiClient.post<ApiResponse<SalesOrder>>(`/sales-orders/${id}/cancel`);
    return res.data.data;
  },
};
