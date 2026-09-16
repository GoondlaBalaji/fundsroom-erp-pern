import axios, { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fundsroom_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for unified error extraction
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const serverMessage = error.response?.data?.error?.message || error.response?.data?.message;
    const fallbackMessage = error.message || 'An unexpected error occurred';
    const message = serverMessage || fallbackMessage;
    
    // Create an enhanced error with clear message
    const customError = new Error(message);
    (customError as any).statusCode = error.response?.status;
    (customError as any).details = error.response?.data?.error?.details;
    (customError as any).rawError = error;

    return Promise.reject(customError);
  }
);
