import { apiClient } from './client';
import { User, ApiResponse } from '../types';

export interface LoginResponseData {
  token: string;
  user: User;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponseData> => {
    const res = await apiClient.post<ApiResponse<LoginResponseData>>('/auth/login', {
      email,
      password,
    });
    return res.data.data;
  },

  getProfile: async (): Promise<User> => {
    const res = await apiClient.get<ApiResponse<User>>('/auth/me');
    return res.data.data;
  },
};
