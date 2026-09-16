import React from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  Layers,
  FileQuestion,
  FileText,
  ShoppingCart,
  Truck,
  LogOut,
  Shield,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type ActiveTab =
  | 'dashboard'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'enquiries'
  | 'quotations'
  | 'sales-orders'
  | 'dispatches';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { user, logout, isAdmin, switchUserQuick } = useAuth();

  const navItems: { id: ActiveTab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Layers },
    { id: 'enquiries', label: 'Enquiries', icon: FileQuestion },
    { id: 'quotations', label: 'Quotations', icon: FileText },
    { id: 'sales-orders', label: 'Sales Orders', icon: ShoppingCart },
    { id: 'dispatches', label: 'Dispatches', icon: Truck },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-title">
          <Package size={22} color="#818cf8" />
          <span>Fundsroom</span>
          <span className="brand-badge">ERP</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
          Manufacturing & Supply Chain
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Role Quick-Switch helper for easy review/testing */}
      <div style={{ padding: '12px 16px', background: '#131c31', borderTop: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
          DEMO ROLE SWITCH:
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn btn-sm ${isAdmin ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '0.7rem', padding: '4px 6px' }}
            onClick={() => switchUserQuick('ADMIN')}
          >
            <Shield size={12} /> Admin
          </button>
          <button
            className={`btn btn-sm ${!isAdmin ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '0.7rem', padding: '4px 6px' }}
            onClick={() => switchUserQuick('SALES_USER')}
          >
            <UserCheck size={12} /> Sales
          </button>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-info">
            <span className="user-name">{user?.fullName || 'User'}</span>
            <span
              className={`user-role-badge ${isAdmin ? 'user-role-admin' : 'user-role-sales'}`}
            >
              {user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px', color: '#ef4444', borderColor: '#334155', background: '#1e293b' }}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
