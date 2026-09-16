import { apiClient } from './client';
import { Product, ApiResponse } from '../types';

export const productApi = {
  getAll: async (): Promise<Product[]> => {
    const res = await apiClient.get<ApiResponse<Product[]>>('/products');
    return res.data.data;
  },

  getById: async (id: string): Promise<Product> => {
    const res = await apiClient.get<ApiResponse<Product>>(`/products/${id}`);
    return res.data.data;
  },
};
