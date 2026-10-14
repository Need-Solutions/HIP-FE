import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useBranding } from '@/features/branding/BrandingContext';

// The admin top bar shows each page's title and subtitle (Figma "Admin / *"). Pages set them with useAdminTitle.

export interface AdminTitle {
  title: string;
  subtitle?: ReactNode;
}

export const AdminTitleContext = createContext<(t: AdminTitle) => void>(() => undefined);

export function useAdminTitle(title: string, subtitle?: ReactNode) {
  const set = useContext(AdminTitleContext);
  const { name } = useBranding();
  useEffect(() => {
    set({ title, subtitle });
    document.title = `${title} · ${name} Admin`;
  }, [set, title, subtitle, name]);
}
