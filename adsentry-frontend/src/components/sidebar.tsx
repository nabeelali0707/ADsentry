'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import Button from '@/components/ui/Button';
import {
  UploadCloud, 
  FileText, 
  LayoutDashboard, 
  AlertTriangle, 
  Coins, 
  Sparkles, 
  Download, 
  LogOut, 
  Menu, 
  X, 
  Building2, 
  UserCircle 
} from 'lucide-react';

const navItems = [
  { name: 'Upload & Setup', href: '/upload', icon: UploadCloud },
  { name: 'Contract Review', href: '/contract-review', icon: FileText },
  { name: 'Compliance Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Discrepancy Explorer', href: '/discrepancies', icon: AlertTriangle },
  { name: 'Financial Impact', href: '/financial-impact', icon: Coins },
  { name: 'AI Audit Summary', href: '/ai-summary', icon: Sparkles },
  { name: 'Export Report', href: '/export', icon: Download },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, logout, isAuthenticated } = useAuditStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Prevent SSR hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-64 hidden md:block bg-navy-950 border-r border-slate-800 animate-pulse">
        <div className="p-6 border-b border-slate-800 h-20"></div>
        <div className="p-4 space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-800 rounded-md w-full"></div>
          ))}
        </div>
      </div>
    );
  }

  // If not authenticated, don't show sidebar
  if (!isAuthenticated) return null;

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="md:hidden w-full flex items-center justify-between px-4 py-3 bg-navy-950/80 backdrop-blur-md border-b border-slate-850 sticky top-0 z-50">
        <span className="text-xl font-bold tracking-tight text-white">
          AdSentry <span className="text-teal-accent">AI</span>
        </span>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 text-slate-400 hover:text-white focus:outline-none"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 glass-panel border-r border-slate-800 flex flex-col justify-between transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div>
          {/* Brand Plain Text Wordmark */}
          <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-2xl font-bold tracking-tight text-white">
              AdSentry <span className="text-teal-accent font-extrabold">AI</span>
            </span>
            <button className="md:hidden p-1 text-slate-400 hover:text-white" onClick={() => setIsOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-205 group
                    ${isActive 
                      ? 'bg-teal-accent/10 text-teal-accent shadow-sm border border-teal-500/20' 
                      : 'text-slate-450 hover:bg-slate-800/40 hover:text-white border border-transparent'
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105 ${isActive ? 'text-teal-accent' : 'text-slate-400 group-hover:text-white'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Area with Profile & Logout */}
        <div className="p-4 border-t border-slate-800/80 space-y-3">
          {userProfile && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="p-2 bg-teal-accent/15 rounded-lg text-teal-accent">
                <UserCircle className="h-5 w-5" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-white truncate">{userProfile.full_name}</p>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{userProfile.role}{userProfile.organization_id ? ` · ${userProfile.organization_id.slice(0, 8).toUpperCase()}` : ''}</span>
                </div>
              </div>
            </div>
          )}

          <Button
            variant="danger"
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="w-full"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Overlay Backdrop for Mobile */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
        />
      )}
    </>
  );
}
