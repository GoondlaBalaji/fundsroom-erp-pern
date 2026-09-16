import { apiClient } from './client';
import { Enquiry, EnquiryStatus, ApiResponse } from '../types';

export interface CreateEnquiryItemInput {
  productId: string;
  quantity: number;
}

export interface CreateEnquiryInput {
  customerId: string;
  requiredDate: string;
  notes?: string;
  items: CreateEnquiryItemInput[];
}

export const enquiryApi = {
  getAll: async (): Promise<Enquiry[]> => {
    const res = await apiClient.get<ApiResponse<Enquiry[]>>('/enquiries');
    return res.data.data;
  },

  getById: async (id: string): Promise<Enquiry> => {
    const res = await apiClient.get<ApiResponse<Enquiry>>(`/enquiries/${id}`);
    return res.data.data;
  },

  create: async (data: CreateEnquiryInput): Promise<Enquiry> => {
    const res = await apiClient.post<ApiResponse<Enquiry>>('/enquiries', data);
    return res.data.data;
  },

  updateStatus: async (id: string, status: EnquiryStatus): Promise<Enquiry> => {
    const res = await apiClient.patch<ApiResponse<Enquiry>>(`/enquiries/${id}/status`, { status });
    return res.data.data;
  },
};
