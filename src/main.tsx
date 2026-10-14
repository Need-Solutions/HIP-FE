import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { BrandingProvider } from '@/features/branding/BrandingProvider';
import { applyCachedBranding } from '@/features/branding/brandingCache';
import { router } from '@/routes/router';
import './index.css';

// Last known brand colours first, so a rebranded group never flashes the default palette.
applyCachedBranding();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </BrandingProvider>
    </QueryClientProvider>
  </StrictMode>,
);
