import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ErrorBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn('flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl', className)}>
      <AlertCircle className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

export default ErrorBanner;
