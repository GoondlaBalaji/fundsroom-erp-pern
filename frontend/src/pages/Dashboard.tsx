import React, { useState, useEffect } from 'react';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { customerApi } from '../api/customers';
import { productApi } from '../api/products';
import { inventoryApi } from '../api/inventory';
import { enquiryApi } from '../api/enquiries';
import { quotationApi } from '../api/quotations';
import { salesOrderApi } from '../api/sales-orders';
import { dispatchApi } from '../api/dispatches';
import { Customer, Product, InventoryViewItem, Enquiry, Quotation, SalesOrder, Dispatch } from '../types';
import {
  Users,
  Package,
  ShoppingCart,
  Truck,
  ArrowRight,
  Layers,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<InventoryViewItem[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [c, p, inv, enq, qtn, so, dsp] = await Promise.all([
          customerApi.getAll(),
          productApi.getAll(),
          inventoryApi.getAll(),
          enquiryApi.getAll(),
          quotationApi.getAll(),
          salesOrderApi.getAll(),
          dispatchApi.getAll(),
        ]);
        setCustomers(c);
        setProducts(p);
        setInventories(inv);
        setEnquiries(enq);
        setQuotations(qtn);
        setSalesOrders(so);
        setDispatches(dsp);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading dashboard data...</div>;
  }

  const pendingOrders = salesOrders.filter((o) => o.status === 'PENDING').length;
  const confirmedOrders = salesOrders.filter((o) => o.status === 'CONFIRMED').length;

  return (
    <div>
      {/* Workflow Process Pipeline Funnel */}
      <div className="workflow-pipeline">
        <div className="pipeline-step">
          <div className="pipeline-step-badge">1</div>
          <div className="pipeline-step-info">
            <span className="pipeline-step-name">Enquiries</span>
            <span className="pipeline-step-desc">{enquiries.length} Active Records</span>
          </div>
        </div>
        <ArrowRight size={18} className="pipeline-arrow" />
        <div className="pipeline-step">
          <div className="pipeline-step-badge">2</div>
          <div className="pipeline-step-info">
            <span className="pipeline-step-name">Quotations</span>
            <span className="pipeline-step-desc">{quotations.length} Issued (INR)</span>
          </div>
        </div>
        <ArrowRight size={18} className="pipeline-arrow" />
        <div className="pipeline-step">
          <div className="pipeline-step-badge">3</div>
          <div className="pipeline-step-info">
            <span className="pipeline-step-name">Sales Orders</span>
            <span className="pipeline-step-desc">{salesOrders.length} Converted</span>
          </div>
        </div>
        <ArrowRight size={18} className="pipeline-arrow" />
        <div className="pipeline-step">
          <div className="pipeline-step-badge">4</div>
          <div className="pipeline-step-info">
            <span className="pipeline-step-name">Reservation</span>
            <span className="pipeline-step-desc">{confirmedOrders} Confirmed</span>
          </div>
        </div>
        <ArrowRight size={18} className="pipeline-arrow" />
        <div className="pipeline-step">
          <div className="pipeline-step-badge">5</div>
          <div className="pipeline-step-info">
            <span className="pipeline-step-name">Dispatch</span>
            <span className="pipeline-step-desc">{dispatches.length} Fulfilled</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Customers"
          value={customers.length}
          description="Registered enterprise clients"
          icon={Users}
          color="#0284c7"
        />
        <StatCard
          title="Catalog Products"
          value={products.length}
          description="Sellable inventory SKUs"
          icon={Package}
          color="#6366f1"
        />
        <StatCard
          title="Pending Orders"
          value={pendingOrders}
          description="Awaiting Admin confirmation"
          icon={ShoppingCart}
          color="#f59e0b"
        />
        <StatCard
          title="Completed Dispatches"
          value={dispatches.length}
          description="Fulfillments processed"
          icon={Truck}
          color="#10b981"
        />
      </div>

      {/* Grid: Low Stock Alert & Recent Orders */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px', marginBottom: '28px' }}>
        {/* Inventory Availability Watchlist */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Layers size={18} color="#4f46e5" />
              <span>Inventory Stock Status</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Formula: Physical - Reserved - Damaged
            </span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Physical</th>
                <th>Reserved</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {inventories.slice(0, 5).map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <strong>{inv.productCode}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.productName}</div>
                  </td>
                  <td>{inv.physicalQuantity} {inv.unit}</td>
                  <td>{inv.reservedQuantity} {inv.unit}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: inv.availableQuantity > 10 ? '#10b981' : '#ef4444',
                      }}
                    >
                      {inv.availableQuantity} {inv.unit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Sales Orders */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <ShoppingCart size={18} color="#d97706" />
              <span>Recent Sales Orders</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Live state machine</span>
          </div>

          {salesOrders.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No sales orders generated yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Total (INR)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesOrders.slice(0, 5).map((so) => (
                  <tr key={so.id}>
                    <td><strong>{so.orderNumber}</strong></td>
                    <td>{so.customer.companyName}</td>
                    <td>₹{Number(so.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td><Badge status={so.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
