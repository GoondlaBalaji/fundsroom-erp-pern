import { apiClient } from './client';
import { Dispatch, ApiResponse } from '../types';

export interface CreateDispatchInput {
  salesOrderId: string;
  vehicleNumber: string;
  driverName: string;
}

export const dispatchApi = {
  getAll: async (): Promise<Dispatch[]> => {
    const res = await apiClient.get<ApiResponse<Dispatch[]>>('/dispatches');
    return res.data.data;
  },

  getById: async (id: string): Promise<Dispatch> => {
    const res = await apiClient.get<ApiResponse<Dispatch>>(`/dispatches/${id}`);
    return res.data.data;
  },

  process: async (data: CreateDispatchInput): Promise<Dispatch> => {
    const res = await apiClient.post<ApiResponse<Dispatch>>('/dispatches', data);
    return res.data.data;
  },
};
