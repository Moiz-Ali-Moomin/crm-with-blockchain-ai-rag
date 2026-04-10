import { apiClient, apiPost } from './client';

export const authApi = {
  login: (email: string, password: string) =>
    apiPost<{ user: any; accessToken: string }>('/auth/login', { email, password }),

  register: (data: {
    organizationName: string;
    organizationSlug: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => apiPost<{ user: any; accessToken: string }>('/auth/register', data),

  logout: () => apiPost<void>('/auth/logout', {}),

  refresh: () =>
    apiClient
      .post<{ success: boolean; data: { accessToken: string } }>('/auth/refresh')
      .then((r) => r.data.data),

  forgotPassword: (email: string) =>
    apiPost<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiPost<{ message: string }>('/auth/reset-password', { token, newPassword }),

  me: () => apiPost<any>('/auth/me', {}),
};
