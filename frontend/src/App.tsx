import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Shell } from './components/layout/Shell';
import { ActiveTab } from './components/layout/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Products } from './pages/Products';
import { Inventory } from './pages/Inventory';
import { Enquiries } from './pages/Enquiries';
import { Quotations } from './pages/Quotations';
import { SalesOrders } from './pages/SalesOrders';
import { Dispatches } from './pages/Dispatches';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#ffffff',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
            Fundsroom ERP
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Initializing enterprise session...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'customers':
        return <Customers />;
      case 'products':
        return <Products />;
      case 'inventory':
        return <Inventory />;
      case 'enquiries':
        return <Enquiries />;
      case 'quotations':
        return <Quotations />;
      case 'sales-orders':
        return <SalesOrders />;
      case 'dispatches':
        return <Dispatches />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Shell activeTab={activeTab} onSelectTab={setActiveTab}>
      {renderContent()}
    </Shell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
