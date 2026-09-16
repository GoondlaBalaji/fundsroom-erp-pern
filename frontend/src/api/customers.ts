import { apiClient } from './client';
import { Customer, ApiResponse } from '../types';

export interface CreateCustomerInput {
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  city: string;
}

export const customerApi = {
  getAll: async (): Promise<Customer[]> => {
    const res = await apiClient.get<ApiResponse<Customer[]>>('/customers');
    return res.data.data;
  },

  getById: async (id: string): Promise<Customer> => {
    const res = await apiClient.get<ApiResponse<Customer>>(`/customers/${id}`);
    return res.data.data;
  },

  create: async (data: CreateCustomerInput): Promise<Customer> => {
    const res = await apiClient.post<ApiResponse<Customer>>('/customers', data);
    return res.data.data;
  },
};
