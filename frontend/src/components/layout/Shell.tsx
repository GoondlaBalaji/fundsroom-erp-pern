import React from 'react';
import { Sidebar, ActiveTab } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, User as UserIcon } from 'lucide-react';

interface ShellProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ activeTab, onSelectTab, children }) => {
  const { user, isAdmin } = useAuth();

  const tabTitles: Record<ActiveTab, string> = {
    dashboard: 'Executive Dashboard & Operations Pipeline',
    customers: 'Customer Master Directory',
    products: 'Product Catalog & Pricing',
    inventory: 'Authoritative Inventory & Stock Availability',
    enquiries: 'Customer Enquiries & Requirements',
    quotations: 'Sales Quotations & Margin Calculator',
    'sales-orders': 'Sales Order Processing & Reservation',
    dispatches: 'Dispatch Execution & Order Fulfillment',
  };

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} onSelectTab={onSelectTab} />

      <div className="main-content">
        <header className="header">
          <div className="header-title">{tabTitles[activeTab]}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                color: '#475569',
                background: '#f8fafc',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              {isAdmin ? <ShieldCheck size={16} color="#d97706" /> : <UserIcon size={16} color="#059669" />}
              <span>
                Signed in as: <strong>{user?.fullName}</strong> ({user?.role})
              </span>
            </div>
          </div>
        </header>

        <main className="page-body">{children}</main>
      </div>
    </div>
  );
};
