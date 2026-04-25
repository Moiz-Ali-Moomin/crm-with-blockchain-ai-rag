'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon } from 'lucide-react';
import { usersApi } from '@/lib/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BillingPage from './billing/page';
import { cn } from '@/lib/utils';

const TABS = ['Profile', 'Security', 'Appearance', 'Billing'] as const;
type Tab = (typeof TABS)[number];

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'Min 8 characters'),
    confirmNewPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      jobTitle: user?.jobTitle ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'UTC',
    },
  });

  const onSubmit = async (data: ProfileForm) => {
    try {
      const updated = await usersApi.updateProfile(data);
      setAuth(updated as any);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First Name</Label><Input {...register('firstName')} />{errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}</div>
        <div><Label>Last Name</Label><Input {...register('lastName')} />{errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}</div>
      </div>
      <div><Label>Job Title</Label><Input {...register('jobTitle')} /></div>
      <div><Label>Phone</Label><Input {...register('phone')} /></div>
      <div><Label>Timezone</Label><Input {...register('timezone')} placeholder="UTC" /></div>
      <Button type="submit" isLoading={isSubmitting}>Save Changes</Button>
    </form>
  );
}

function SecurityTab() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordForm) => {
    try {
      await usersApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      toast.success('Password changed');
      reset();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div><Label>Current Password</Label><Input type="password" {...register('currentPassword')} />{errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}</div>
      <div><Label>New Password</Label><Input type="password" {...register('newPassword')} />{errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}</div>
      <div><Label>Confirm New Password</Label><Input type="password" {...register('confirmNewPassword')} />{errors.confirmNewPassword && <p className="text-xs text-red-500">{errors.confirmNewPassword.message}</p>}</div>
      <Button type="submit" isLoading={isSubmitting}>Change Password</Button>
    </form>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <p className="text-sm font-medium text-fg mb-1">Theme</p>
        <p className="text-xs text-fg-muted mb-4">Choose how the dashboard looks to you.</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
              theme === 'light'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            )}
          >
            <div className="w-12 h-12 rounded-xl bg-canvas border border-ui-border flex items-center justify-center shadow-sm">
              <Sun size={22} className="text-amber-500" />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-semibold', theme === 'light' ? 'text-blue-600' : 'text-gray-700 dark:text-gray-200')}>Light</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Clean white theme</p>
            </div>
            {theme === 'light' && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Active</span>
            )}
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
              theme === 'dark'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            )}
          >
            <div className="w-12 h-12 rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center shadow-sm">
              <Moon size={22} className="text-blue-400" />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-semibold', theme === 'dark' ? 'text-blue-600' : 'text-gray-700 dark:text-gray-200')}>Dark</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Easy on the eyes</p>
            </div>
            {theme === 'dark' && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-400 px-2 py-0.5 rounded-full">Active</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Profile');

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="border-b border-ui-border">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Billing' ? (
        <BillingPage />
      ) : tab === 'Appearance' ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
          <CardContent><AppearanceTab /></CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{tab}</CardTitle></CardHeader>
          <CardContent>
            {tab === 'Profile' && <ProfileTab />}
            {tab === 'Security' && <SecurityTab />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
