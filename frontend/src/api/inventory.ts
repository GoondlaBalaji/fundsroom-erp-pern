import { apiClient } from './client';
import { InventoryViewItem, ApiResponse } from '../types';

export const inventoryApi = {
  getAll: async (): Promise<InventoryViewItem[]> => {
    const res = await apiClient.get<ApiResponse<InventoryViewItem[]>>('/inventory');
    return res.data.data;
  },
};
