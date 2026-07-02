'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  Wifi,
  FileCode,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Key,
  X,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Gateways', href: '/gateways', icon: Wifi },
  { name: 'Firmware', href: '/firmware', icon: FileCode },
  { name: 'Monitoring', href: '/monitoring', icon: Activity },
  { name: 'Provisioning', href: '/provisioning', icon: Key },
  { name: 'Audit Logs', href: '/audit', icon: ScrollText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <div className="hidden md:flex">
        <SidebarPanel
          showLabels={!collapsed}
          onToggle={onToggle}
          onNavClick={onMobileClose}
          showToggle
        />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="fixed left-0 top-0 h-full shadow-xl animate-in slide-in-from-left">
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -right-10 top-3 rounded-full bg-background shadow-md"
                onClick={onMobileClose}
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
              <SidebarPanel showLabels onNavClick={onMobileClose} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarPanel({
  showLabels,
  onToggle,
  onNavClick,
  showToggle,
}: {
  showLabels: boolean;
  onToggle?: () => void;
  onNavClick?: () => void;
  showToggle?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-sidebar transition-all duration-300',
        showLabels ? 'w-64' : 'w-16',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link
          href="/dashboard"
          className={cn('flex items-center gap-2', !showLabels && 'justify-center w-full')}
          onClick={onNavClick}
        >
          <img src="/logo.svg" alt="Mango IoT" className="h-6 shrink-0" />
          {showLabels && (
            <span className="font-bold text-sidebar-foreground">Mango</span>
          )}
        </Link>
        {showToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex shrink-0"
            onClick={onToggle}
            aria-label={showLabels ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {showLabels ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                  !showLabels && 'justify-center px-2',
                )}
                title={!showLabels ? item.name : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {showLabels && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
