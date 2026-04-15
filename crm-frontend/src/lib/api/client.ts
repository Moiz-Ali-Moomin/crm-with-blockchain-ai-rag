import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// NEXT_PUBLIC_API_URL must include /api/v1 (e.g. https://bestpurchasestore.com/api/v1).
// The fallback appends it so local dev without an .env.local still works.
const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const API_URL = _rawApiUrl.endsWith('/api/v1') ? _rawApiUrl : `${_rawApiUrl}/api/v1`;

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

// Track if a token refresh is in progress to avoid multiple simultaneous refreshes
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: AxiosError | null, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });
  failedQueue = [];
}

// Request interceptor: attach access token + start request timer
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Track request start time for latency measurement
    (config as any)._startTime = Date.now();

    // Dynamically import to avoid circular dependencies at module load time
    const { useAuthStore } = require('@/store/auth.store');
    const token: string | null = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 by refreshing token and retrying + capture latency
apiClient.interceptors.response.use(
  (response) => {
    // Capture API latency for observability
    const startTime = (response.config as any)._startTime;
    if (startTime) {
      const { observe } = require('@/lib/observability');
      observe.apiLatency(
        response.config.url ?? '',
        response.config.method?.toUpperCase() ?? 'GET',
        Date.now() - startTime,
        response.status,
        response.headers?.['x-request-id'],
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry refresh endpoint itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        const { useAuthStore } = require('@/store/auth.store');
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await apiClient.post('/auth/refresh');
        const newToken: string = response.data.data.accessToken;

        const { useAuthStore } = require('@/store/auth.store');
        useAuthStore.getState().setAccessToken(newToken);

        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);

        const { useAuthStore } = require('@/store/auth.store');
        useAuthStore.getState().logout();

        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Backend envelope: { success, data, meta, timestamp, requestId }
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  timestamp: string;
  requestId: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const res = await apiClient.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
}

export async function apiGetPaginated<T>(
  url: string,
  params?: object
): Promise<PaginatedResult<T>> {
  const res = await apiClient.get<ApiEnvelope<T[]>>(url, { params });
  return {
    data: res.data.data,
    meta: res.data.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 },
  };
}

export async function apiPost<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.post<ApiEnvelope<T>>(url, data, config);
  return res.data.data;
}

export async function apiPut<T>(url: string, data?: object): Promise<T> {
  const res = await apiClient.put<ApiEnvelope<T>>(url, data);
  return res.data.data;
}

export async function apiPatch<T>(url: string, data?: object): Promise<T> {
  const res = await apiClient.patch<ApiEnvelope<T>>(url, data);
  return res.data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await apiClient.delete<ApiEnvelope<T>>(url);
  return res.data.data;
}

export default apiClient;
