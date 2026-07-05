import { useState } from 'react';
import {
  BookOpen,
  DollarSign,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export type TabType = 'students' | 'fees' | 'leads' | 'courses' | 'batches';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'students', label: 'Students', icon: Users },
  { id: 'fees', label: 'Fees', icon: DollarSign },
  { id: 'leads', label: 'Leads', icon: UserCheck },
  { id: 'courses', label: 'Program Setup', icon: BookOpen, superAdminOnly: true },
  { id: 'batches', label: 'Batches', icon: LayoutGrid, superAdminOnly: true },
];

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isSuperAdmin: boolean;
}

const Sidebar = ({ isSuperAdmin }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeTab = (location.pathname.split('/')[1] as TabType) || 'students';
  const visibleItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);

  const goTo = (tab: TabType) => {
    navigate(`/${tab}`);
    setMobileOpen(false);
  };

  const renderContent = (isMobile = false) => (
    <>
      <div className="h-14 flex items-center justify-between border-b border-white/7 flex-shrink-0 overflow-hidden px-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-navy flex-shrink-0">
            <span className="text-white font-bold text-xs tracking-tight">CK</span>
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden">
              Chess Klub
            </span>
          )}
        </div>
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((value) => !value)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 flex flex-col gap-0.5 py-3 px-2 overflow-hidden">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`
                relative flex items-center gap-3 h-9 px-2 rounded-lg transition-colors duration-150 w-full text-left overflow-hidden
                ${isActive
                  ? 'bg-primary-600/20 text-primary-300'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-400 rounded-r-full" />
              )}
              <Icon className="w-4 h-4 flex-shrink-0 ml-0.5" strokeWidth={isActive ? 2.2 : 1.8} />
              {(!collapsed || isMobile) && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-2 pb-3">
        <div className="h-9 flex items-center gap-3 px-2 rounded-lg bg-surface-alt/70 border border-white/7 overflow-hidden">
          <div className="w-4 h-4 rounded-full bg-accent-600/20 flex items-center justify-center flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 block" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-xs text-text-tertiary whitespace-nowrap">
              {isSuperAdmin ? 'Super Admin' : 'Admin'}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed left-3 top-3 z-50 w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-white/10 text-text-secondary shadow-navy"
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />
          <aside className="relative w-64 h-full bg-surface border-r border-white/7 shadow-navy-lg flex flex-col">
            {renderContent(true)}
          </aside>
        </div>
      )}

      <aside className={`hidden md:flex flex-shrink-0 flex-col bg-surface border-r border-white/7 h-screen sticky top-0 z-40 transition-all duration-200 ease-out overflow-hidden ${collapsed ? 'w-16' : 'w-56'}`}>
        {renderContent(false)}
      </aside>
    </>
  );
};

export default Sidebar;
