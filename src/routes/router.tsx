import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';
import { PublicLayout, SiteFooter } from '@/layouts/PublicLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { HikerLayout } from '@/layouts/HikerLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { CheckinLayout } from '@/layouts/CheckinLayout';
import { AppShell } from '@/layouts/AppShell';
import { RequireRole } from '@/features/auth/RequireRole';
import { RequirePermission } from '@/features/auth/RequirePermission';
import NotFound from '@/pages/NotFound';

// Route map. Each page is code-split. See CLAUDE.md for the Figma frame behind every route.
const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load);
  return (
    // min-h keeps the footer below the fold while a page loads, so it doesn't jump down (CLS).
    <Suspense fallback={<div className="min-h-[100dvh] p-10 text-slate">Loading…</div>}>
      <C />
    </Suspense>
  );
};

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // Landing places the floating nav over the hero.
      { path: '/', element: <><main id="main" tabIndex={-1} className="focus:outline-none"><Outlet /></main><SiteFooter /></>, children: [{ index: true, element: page(() => import('@/pages/public/Landing')) }] },

      {
        element: <PublicLayout />,
        children: [
          { path: 'events', element: page(() => import('@/pages/public/Events')) },
          { path: 'events/:slug', element: page(() => import('@/pages/public/EventDetails')) },
          { path: 'about', element: page(() => import('@/pages/public/About')) },
          { path: 'find-ticket', element: page(() => import('@/pages/public/FindTicket')) },
          { path: 'terms', element: page(() => import('@/pages/public/Terms')) },
          { path: 'privacy', element: page(() => import('@/pages/public/Privacy')) },
          // Guest checkout: no login required (sign-up is optional).
          { path: 'checkout/:eventId', element: page(() => import('@/pages/hiker/Checkout')) },
          { path: 'tickets/:code', element: page(() => import('@/pages/hiker/TicketView')) }, // guest one-time link lands here
        ],
      },

      {
        element: <AuthLayout />,
        children: [
          { path: 'signup', element: page(() => import('@/pages/auth/SignUp')) },
          { path: 'verify', element: page(() => import('@/pages/auth/VerifyOtp')) },
          { path: 'login', element: page(() => import('@/pages/auth/Login')) },
          { path: 'forgot-password', element: page(() => import('@/pages/auth/ForgotPassword')) },
          { path: 'reset-password', element: page(() => import('@/pages/auth/ResetPassword')) },
          { path: 'welcome', element: page(() => import('@/pages/auth/AccountVerified')) },
        ],
      },
      // Staff sign-in has its own full-screen layout (Figma "Admin / Log in").
      { path: '/staff/login', element: page(() => import('@/pages/auth/StaffLogin')) },

      {
        path: 'account',
        element: <RequireRole roles={['hiker']} />,
        children: [
          {
            element: <HikerLayout />,
            children: [
              { index: true, element: page(() => import('@/pages/hiker/Dashboard')) },
              { path: 'tickets', element: page(() => import('@/pages/hiker/MyTickets')) },
              { path: 'tickets/:code', element: page(() => import('@/pages/hiker/TicketView')) },
              { path: 'history', element: page(() => import('@/pages/hiker/History')) },
              { path: 'profile', element: page(() => import('@/pages/hiker/Profile')) },
            ],
          },
        ],
      },

      {
        path: 'checkin',
        element: <RequireRole roles={['checkin_staff', 'admin', 'super_admin']} loginPath="/staff/login" />,
        children: [
          {
            element: <CheckinLayout />,
            children: [
              { index: true, element: page(() => import('@/pages/checkin/SelectEvent')) },
              { path: ':eventId/offline', element: page(() => import('@/pages/checkin/OfflineDownload')) },
              { path: ':eventId/scan', element: page(() => import('@/pages/checkin/Scanner')) },
              { path: ':eventId/search', element: page(() => import('@/pages/checkin/ManualSearch')) },
              { path: ':eventId/sync', element: page(() => import('@/pages/checkin/Sync')) },
              { path: ':eventId/close', element: page(() => import('@/pages/checkin/CloseAttendance')) },
            ],
          },
        ],
      },

      {
        path: 'admin',
        element: <RequireRole roles={['admin', 'super_admin', 'advertiser']} loginPath="/staff/login" />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              {
                element: <RequirePermission permission="manage_events" />,
                children: [
                  { index: true, element: page(() => import('@/pages/admin/Overview')) },
                  { path: 'events', element: page(() => import('@/pages/admin/Events')) },
                  { path: 'events/new', element: page(() => import('@/pages/admin/EventEditor')) },
                  { path: 'events/:eventId/edit', element: page(() => import('@/pages/admin/EventEditor')) },
                  { path: 'events/:eventId/participants', element: page(() => import('@/pages/admin/Participants')) },
                  { path: 'tickets/:code', element: page(() => import('@/pages/admin/TicketDetail')) },
                  { path: 'checkin', element: page(() => import('@/pages/admin/CheckinSettings')) },
                  { path: 'checkin/:eventId/sync', element: page(() => import('@/pages/admin/OfflineSync')) },
                  { path: 'staff', element: page(() => import('@/pages/admin/Staff')) },
                ],
              },
              {
                element: <RequirePermission permission="view_analytics" />,
                children: [
                  { path: 'analytics', element: page(() => import('@/pages/admin/Analytics')) },
                ],
              },
              {
                element: <RequirePermission permission="sell_refund_tickets" />,
                children: [
                  { path: 'transactions', element: page(() => import('@/pages/admin/Transactions')) },
                ],
              },
              {
                element: <RequirePermission permission="view_hikers" />,
                children: [
                  { path: 'hikers', element: page(() => import('@/pages/admin/Hikers')) },
                  { path: 'hikers/:hikerId', element: page(() => import('@/pages/admin/HikerProfile')) },
                ],
              },
              {
                element: <RequirePermission permission="manage_ads" />,
                children: [
                  { path: 'ads', element: page(() => import('@/pages/admin/Ads')) },
                  { path: 'ads/new', element: page(() => import('@/pages/admin/AdEditor')) },
                  { path: 'ads/:adId/edit', element: page(() => import('@/pages/admin/AdEditor')) },
                  { path: 'ads/:adId', element: page(() => import('@/pages/admin/AdPerformance')) },
                ],
              },
              {
                element: <RequirePermission permission="manage_settings" />,
                children: [
                  { path: 'notifications', element: page(() => import('@/pages/admin/Notifications')) },
                  { path: 'branding', element: page(() => import('@/pages/admin/Branding')) },
                ],
              },
              {
                element: <RequirePermission permission="view_audit_log" />,
                children: [
                  { path: 'audit-log', element: page(() => import('@/pages/admin/AuditLog')) },
                ],
              },
            ],
          },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
