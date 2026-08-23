import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Layers,
  Users,
  Clock,
  FileText,
  TrendingUp,
  ShieldCheck,
  Palette,
  ChevronDown,
} from 'lucide-react';
import OverviewTab from './OverviewTab.js';
import InventoryTab from './InventoryTab.js';
import ServicesBomTab from './ServicesBomTab.js';
import HrPayrollTab from './HrPayrollTab.js';
import ActiveShiftTab from './ActiveShiftTab.js';
import OrdersHistoryTab from './OrdersHistoryTab.js';
import ExpensesTab from './ExpensesTab.js';
import EtaSettingsTab from './EtaSettingsTab.js';
import PosAppearanceTab from './PosAppearanceTab.js';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const tabs = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'inventory', label: 'المخزون بالجرام (BOM)', icon: <Package className="w-4 h-4 shrink-0" /> },
    { id: 'services', label: 'الخدمات والوصفات', icon: <Layers className="w-4 h-4 shrink-0" /> },
    { id: 'pos_appearance', label: 'مظهر وخلفية الكاشير', icon: <Palette className="w-4 h-4 shrink-0" /> },
    { id: 'hr', label: 'الموظفين والرواتب', icon: <Users className="w-4 h-4 shrink-0" /> },
    { id: 'active_shift', label: 'وردية الكاشير الحالية', icon: <Clock className="w-4 h-4 shrink-0" /> },
    { id: 'orders', label: 'سجل الفواتير', icon: <FileText className="w-4 h-4 shrink-0" /> },
    { id: 'expenses', label: 'المصروفات والأرباح (P&L)', icon: <TrendingUp className="w-4 h-4 shrink-0" /> },
    { id: 'eta', label: 'الربط والامتثال الضريبي (ETA)', icon: <ShieldCheck className="w-4 h-4 shrink-0" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Mobile Tab Quick Dropdown Selector (Visible on small screens) */}
      <div className="sm:hidden block">
        <div className="relative">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full py-3 px-4 rounded-2xl border text-xs font-bold text-slate-100 appearance-none focus:outline-none shadow-md cursor-pointer"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--border-color)',
            }}
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id} className="bg-slate-900 text-white">
                {tab.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
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
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 backdrop-blur-md active:scale-95 ${
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
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Active Tab Content View */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'overview' && (
          <OverviewTab onNavigateTab={(targetTab) => setActiveTab(targetTab)} />
        )}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'services' && <ServicesBomTab />}
        {activeTab === 'pos_appearance' && <PosAppearanceTab />}
        {activeTab === 'hr' && <HrPayrollTab />}
        {activeTab === 'active_shift' && <ActiveShiftTab />}
        {activeTab === 'orders' && <OrdersHistoryTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'eta' && <EtaSettingsTab />}
      </div>
    </div>
  );
};

export default AdminDashboard;
