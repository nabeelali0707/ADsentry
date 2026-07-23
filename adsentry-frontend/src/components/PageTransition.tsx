'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

/**
 * Re-triggers the fade-in/slide-up entrance animation on every route change
 * by remounting its child tree (keyed on pathname) instead of relying on a
 * static className that only animates once on first mount.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}
