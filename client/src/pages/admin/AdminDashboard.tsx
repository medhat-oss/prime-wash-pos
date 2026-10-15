import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { OverviewTab } from './OverviewTab.js';
import { InventoryTab } from './InventoryTab.js';
import { ServicesBomTab } from './ServicesBomTab.js';
import { PosAppearanceTab } from './PosAppearanceTab.js';
import { HrPayrollTab } from './HrPayrollTab.js';
import { ActiveShiftTab } from './ActiveShiftTab.js';
import { LandingSettingsTab } from './LandingSettingsTab.js';
import { OrdersHistoryTab } from './OrdersHistoryTab.js';
import { ExpensesTab } from './ExpensesTab.js';
import { EtaSettingsTab } from './EtaSettingsTab.js';
import { safeSessionStorage } from '../../utils/safeStorage.js';

interface ErrorBoundaryProps {
  children: ReactNode;
  tabName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Tab render error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.tabName !== this.props.tabName && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-3xl border border-rose-500/30 bg-rose-950/20 backdrop-blur-md text-center space-y-4 my-4">
          <div className="text-3xl">⚠️</div>
          <h3 className="text-sm font-bold text-rose-300">حدث خطأ أثناء عرض هذا التبويب</h3>
          <p className="text-xs text-slate-400">{this.state.error?.message || 'تعذر تحميل محتوى التبويب'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const VALID_ADMIN_TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'inventory', label: 'المخزون بالجرام (BOM)' },
  { id: 'services', label: 'الخدمات والوصفات' },
  { id: 'pos_appearance', label: 'مظهر وخلفية الكاشير' },
  { id: 'hr', label: 'الموظفين والرواتب' },
  { id: 'active_shift', label: 'ورديات الكاشير' },
  { id: 'landing_cms', label: 'صفحة العروض والزوار' },
  { id: 'orders', label: 'سجل الفواتير' },
  { id: 'expenses', label: 'المصروفات والأرباح (P&L)' },
  { id: 'eta', label: 'الربط والامتثال الضريبي (ETA)' },
] as const;

export type AdminTabId = (typeof VALID_ADMIN_TABS)[number]['id'];

const getInitialAdminTab = (): AdminTabId => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (VALID_ADMIN_TABS.some((t) => t.id === hash)) {
      return hash as AdminTabId;
    }
    const saved = safeSessionStorage.getItem('cw_admin_active_tab');
    if (saved && VALID_ADMIN_TABS.some((t) => t.id === saved)) {
      return saved as AdminTabId;
    }
  }
  return 'overview';
};

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTabId>(getInitialAdminTab);

  const handleTabChange = (targetTab: string) => {
    if (!VALID_ADMIN_TABS.some((t) => t.id === targetTab)) return;
    const tabId = targetTab as AdminTabId;
    setActiveTab(tabId);
    safeSessionStorage.setItem('cw_admin_active_tab', tabId);
    if (typeof window !== 'undefined' && window.location.hash !== `#${tabId}`) {
      window.location.hash = tabId;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '').trim();
      if (VALID_ADMIN_TABS.some((t) => t.id === hash)) {
        setActiveTab(hash as AdminTabId);
        safeSessionStorage.setItem('cw_admin_active_tab', hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    // Initial sync of hash if valid tab is selected but hash is missing/generic
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace(/^#/, '').trim();
      if (!VALID_ADMIN_TABS.some((t) => t.id === currentHash)) {
        window.history.replaceState(null, '', `#${activeTab}`);
      }
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [activeTab]);

  return (
    <div className="space-y-5">
      {/* Mobile Tab Quick Dropdown Selector (Visible on small screens) */}
      <div className="sm:hidden block">
        <div className="relative">
          <select
            value={activeTab}
            onChange={(e) => handleTabChange(e.target.value)}
            className="w-full py-3 px-4 rounded-2xl border text-xs font-bold text-slate-100 appearance-none focus:outline-none shadow-md cursor-pointer"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            {VALID_ADMIN_TABS.map((tab) => (
              <option key={tab.id} value={tab.id} className="bg-slate-900 text-white">
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub Tabs Horizontal Scrollable Bar (Touch friendly on mobile, full width on desktop) */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 border-b scrollbar-none touch-pan-x transition-colors duration-300"
        style={{
          borderColor: 'var(--border-color)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {VALID_ADMIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center justify-center px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 backdrop-blur-md active:scale-95 ${
              activeTab === tab.id
                ? 'text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            style={
              activeTab === tab.id
                ? {
                    backgroundColor: 'var(--color-primary)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                    borderColor: 'var(--color-primary)',
                  }
                : {
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-color)',
                  }
            }
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Active Tab Content View wrapped with TabErrorBoundary */}
      <div>
        <TabErrorBoundary key={activeTab} tabName={activeTab}>
          {activeTab === 'overview' && (
            <OverviewTab onNavigateTab={(targetTab) => handleTabChange(targetTab)} />
          )}
          {activeTab === 'inventory' && <InventoryTab />}
          {activeTab === 'services' && <ServicesBomTab />}
          {activeTab === 'pos_appearance' && <PosAppearanceTab />}
          {activeTab === 'hr' && <HrPayrollTab />}
          {activeTab === 'active_shift' && <ActiveShiftTab />}
          {activeTab === 'landing_cms' && <LandingSettingsTab />}
          {activeTab === 'orders' && <OrdersHistoryTab />}
          {activeTab === 'expenses' && <ExpensesTab />}
          {activeTab === 'eta' && <EtaSettingsTab />}
        </TabErrorBoundary>
      </div>
    </div>
  );
};

export default AdminDashboard;
