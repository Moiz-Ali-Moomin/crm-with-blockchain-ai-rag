import { apiClient, apiGet, apiPost } from './client';
import type { User } from '@/store/auth.store';

export const authApi = {
  login: (email: string, password: string) =>
    apiPost<{ user: User }>('/auth/login', { email, password }),

  register: (data: {
    organizationName: string;
    organizationSlug: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => apiPost<{ user: User }>('/auth/register', data),

  logout: () => apiPost<void>('/auth/logout', {}),

  // Sends the refresh_token cookie; NestJS responds with Set-Cookie for new tokens.
  refresh: () => apiClient.post('/auth/refresh'),

  me: () => apiGet<User>('/auth/me'),

  forgotPassword: (email: string) =>
    apiPost<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiPost<{ message: string }>('/auth/reset-password', { token, password: newPassword }),
};
