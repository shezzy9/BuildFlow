import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Receipt,
  FileText,
  Truck,
  Users,
  BarChart3,
  UserCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { AppScreen } from '../../types';
import { Button } from '../ui/Primitives';
import { evaluateLowStockAlerts } from '../../utils/inventoryLogic';

interface NavItem {
  id: AppScreen;
  matchScreens: AppScreen[];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SIDEBAR_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    matchScreens: ['dashboard'],
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'products',
    matchScreens: ['products', 'product-form'],
    label: 'Products',
    icon: Package,
  },
  {
    id: 'inventory',
    matchScreens: ['inventory'],
    label: 'Inventory',
    icon: Boxes,
  },
  {
    id: 'purchase-entry',
    matchScreens: ['purchase-entry', 'purchase-history'],
    label: 'Purchases',
    icon: ShoppingCart,
  },
  {
    id: 'pos-billing',
    matchScreens: ['pos-billing', 'sales-history'],
    label: 'Sales & Billing',
    icon: Receipt,
  },
  {
    id: 'invoice-detail',
    matchScreens: ['invoice-detail'],
    label: 'Invoices',
    icon: FileText,
  },
  {
    id: 'suppliers',
    matchScreens: ['suppliers'],
    label: 'Suppliers',
    icon: Truck,
  },
  {
    id: 'customers',
    matchScreens: ['customers'],
    label: 'Customers',
    icon: Users,
  },
  {
    id: 'reports',
    matchScreens: ['reports'],
    label: 'Reports',
    icon: BarChart3,
  },
  {
    id: 'team',
    matchScreens: ['team'],
    label: 'Team & Users',
    icon: UserCheck,
  },
  {
    id: 'settings',
    matchScreens: ['settings'],
    label: 'Settings',
    icon: Settings,
  },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    screen,
    setScreen,
    currentUser,
    logout,
    settings,
    products,
    setInventoryFilterPreset,
  } = useStore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const lowStockSummary = React.useMemo(
    () => evaluateLowStockAlerts(products, settings.lowStockGlobalThreshold),
    [products, settings.lowStockGlobalThreshold]
  );

  const activeNavItem =
    SIDEBAR_ITEMS.find((item) => item.matchScreens.includes(screen)) || SIDEBAR_ITEMS[0];

  const handleNavigate = (target: AppScreen) => {
    setScreen(target);
    setMobileDrawerOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#FFFFFF] border-r border-[#E7E4DC] w-64 select-none">
      {/* Brand Lockup */}
      <div className="h-16 px-5 border-b border-[#E7E4DC] flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleNavigate('dashboard')}
          className="text-base font-bold tracking-tight text-[#252923] font-display cursor-pointer text-left"
        >
          {settings.businessName}
        </button>
        <button
          type="button"
          onClick={() => handleNavigate('landing')}
          title="View Public Website"
          aria-label="View Public Website"
          className="p-1.5 text-[#777A73] hover:text-[#252923] hover:bg-[#F7F6F2] transition-colors cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Workspace Navigation" className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchScreens.includes(screen);
          const showLowStockBadge =
            item.id === 'inventory' && lowStockSummary.totalAlertsCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#315744] text-white'
                  : 'text-[#252923] hover:bg-[#F7F6F2]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-[#777A73]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {showLowStockBadge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-mono tabular-nums font-semibold shrink-0 ${
                    isActive
                      ? 'bg-[#FFFFFF]/20 text-white'
                      : lowStockSummary.criticalCount > 0
                      ? 'bg-[#FDF3F1] text-[#9E3B24] border border-[#BD704F]/40'
                      : 'bg-[#F7F6F2] text-[#BD704F] border border-[#BD704F]/40'
                  }`}
                >
                  {lowStockSummary.totalAlertsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Logged-in User & Logout Action */}
      <div className="p-4 border-t border-[#E7E4DC] bg-[#F7F6F2]/60">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#252923] truncate">
              {currentUser?.name || 'Julian Vance'}
            </div>
            <div className="text-[11px] text-[#777A73] truncate">
              {currentUser?.role || 'Admin'} · {currentUser?.email || 'shezzyyt371@gmail.com'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title="Sign Out"
            aria-label="Sign Out"
            className="p-2 text-[#777A73] hover:text-[#9E3B24] hover:bg-[#FFFFFF] border border-transparent hover:border-[#E7E4DC] transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#252923] flex">
      {/* Persistent Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-[#252923]/40"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            {renderSidebarContent()}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="h-10 w-10 m-2 bg-[#FFFFFF] border border-[#E7E4DC] flex items-center justify-center text-[#252923]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Bar — Contextual Breadcrumbs + Primary Action */}
        <header className="sticky top-0 z-20 h-16 bg-[#F7F6F2]/95 border-b border-[#E7E4DC] px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 bg-[#FFFFFF] border border-[#E7E4DC] text-[#252923]"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="text-xs font-mono text-[#777A73] flex items-center gap-2 truncate">
              <span className="hidden sm:inline">{settings.businessName}</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="text-[#252923] font-medium">{activeNavItem.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {lowStockSummary.totalAlertsCount > 0 && screen !== 'inventory' && (
              <button
                type="button"
                onClick={() => {
                  setInventoryFilterPreset('low');
                  setScreen('inventory');
                }}
                aria-label={`View ${lowStockSummary.totalAlertsCount} low stock alerts in Inventory`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#FDF3F1] text-[#9E3B24] border border-[#BD704F] hover:bg-[#F9E6E2] transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#BD704F] shrink-0" />
                <span>
                  {lowStockSummary.totalAlertsCount} Low Stock{' '}
                  {lowStockSummary.totalAlertsCount === 1 ? 'Alert' : 'Alerts'}
                </span>
              </button>
            )}
            {screen !== 'pos-billing' && screen !== 'dashboard' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setScreen('pos-billing')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Sale</span>
              </Button>
            )}
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
