import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// NEXT_PUBLIC_API_URL must include /api/v1 (e.g. https://bestpurchasestore.com/api/v1).
// The fallback appends it so local dev without an .env.local still works.
const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const API_URL = _rawApiUrl.endsWith('/api/v1') ? _rawApiUrl : `${_rawApiUrl}/api/v1`;

export const apiClient = axios.create({
  baseURL: API_URL,
  // withCredentials sends the httpOnly access_token + refresh_token cookies
  // on every request, so no Authorization header management is needed.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 30_000,
});

// Track whether a token refresh is already in flight to queue concurrent 401s.
let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: AxiosError | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
}

// Request interceptor: start latency timer (no token attachment — cookies handle auth).
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    (config as any)._startTime = Date.now();
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: capture latency + silent token refresh on 401.
apiClient.interceptors.response.use(
  (response) => {
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
      // Don't try to refresh if the refresh endpoint itself returned 401.
      if (originalRequest.url?.includes('/auth/refresh')) {
        const { useAuthStore } = require('@/store/auth.store');
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }

      // Never replay AI requests after a token refresh. They are long-running
      // (20-60 s) and replaying them would fire a duplicate pipeline on the
      // backend. The frontend's error handler will show a session-expired
      // message instead. The user can log in and retry manually.
      if (originalRequest.url?.includes('/ai/')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // POST /auth/refresh sends the refresh_token cookie and the NestJS backend
        // responds with Set-Cookie headers containing fresh access_token + refresh_token.
        // No token value needs to be extracted from the response body.
        await apiClient.post('/auth/refresh');
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        const { useAuthStore } = require('@/store/auth.store');
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// Backend envelope: { success, data, meta, timestamp, requestId }
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { total: number; page: number; limit: number; totalPages: number };
  timestamp: string;
  requestId: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const res = await apiClient.get<ApiEnvelope<T>>(url, { params });
  return res.data.data;
}

export async function apiGetPaginated<T>(
  url: string,
  params?: object,
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
