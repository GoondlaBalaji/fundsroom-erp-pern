import React, { useState, useEffect } from 'react';
import { salesOrderApi } from '../api/sales-orders';
import { SalesOrder } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Eye,
  Lock,
  Truck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SalesOrders: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await salesOrderApi.getAll();
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleConfirmOrder = async (orderId: string) => {
    if (!isAdmin) {
      alert('Access denied: User role SALES_USER cannot confirm sales orders. Admin privilege required.');
      return;
    }

    const confirmMsg =
      'Confirm this Sales Order and atomically reserve stock?\n\n' +
      'Backend will acquire PostgreSQL row-level locks on inventory in deterministic product order.';

    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      const updated = await salesOrderApi.confirmAndReserve(orderId);
      alert(`Sales Order ${updated.orderNumber} successfully confirmed! Inventory reserved.`);
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(`Confirmation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async (order: SalesOrder) => {
    if (!isAdmin) {
      alert('Access denied: User role SALES_USER cannot cancel sales orders.');
      return;
    }

    let warning = `Are you sure you want to cancel Sales Order ${order.orderNumber}?`;
    if (order.status === 'CONFIRMED') {
      warning += '\n\nNote: This order is currently CONFIRMED. Cancelling will atomically RELEASE reserved stock back to available pool.';
    }

    if (!window.confirm(warning)) return;

    try {
      setActionLoading(true);
      const updated = await salesOrderApi.cancel(order.id);
      alert(`Sales Order ${updated.orderNumber} has been cancelled.`);
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) =>
    statusFilter === 'ALL' ? true : o.status === statusFilter
  );

  return (
    <div>
      {/* RBAC Info Banner */}
      {!isAdmin && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.85rem',
            color: '#92400e',
          }}
        >
          <Lock size={16} />
          <span>
            You are signed in as <strong>{user?.fullName} (SALES_USER)</strong>. Viewing sales orders is allowed, but order confirmation and cancellation require <strong>ADMIN</strong> privileges.
          </span>
        </div>
      )}

      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={20} color="#4f46e5" />
            <span className="table-title">Sales Orders Register</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({orders.length} total)</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {['ALL', 'PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading sales orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No sales orders matching filter.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Confirmed By</th>
                <th>Dispatch</th>
                <th>Workflow Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                      {order.orderNumber}
                    </span>
                  </td>
                  <td>
                    <strong>{order.customer?.companyName}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{order.customer?.city}</div>
                  </td>
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td>
                    <strong>
                      ₹{Number(order.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                  <td>
                    <Badge status={order.status} />
                  </td>
                  <td>
                    {order.confirmedBy ? (
                      <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 500 }}>
                        {order.confirmedBy.fullName}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Unconfirmed</span>
                    )}
                  </td>
                  <td>
                    {order.dispatch ? (
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 600, fontSize: '0.8rem' }}>
                        {order.dispatch.dispatchNumber}
                      </span>
                    ) : order.status === 'CONFIRMED' ? (
                      <span style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 600 }}>Ready to Dispatch</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>-</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Eye size={14} /> View
                      </button>

                      {/* Confirm Button: Only for PENDING orders */}
                      {order.status === 'PENDING' && (
                        <button
                          className="btn btn-success btn-sm"
                          disabled={!isAdmin || actionLoading}
                          title={!isAdmin ? 'Admin role required' : 'Confirm order and reserve inventory'}
                          onClick={() => handleConfirmOrder(order.id)}
                        >
                          <CheckCircle2 size={14} /> Confirm & Reserve
                        </button>
                      )}

                      {/* Cancel Button: Allowed for PENDING or CONFIRMED */}
                      {(order.status === 'PENDING' || order.status === 'CONFIRMED') && (
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={!isAdmin || actionLoading}
                          title={!isAdmin ? 'Admin role required' : 'Cancel order and release reserved stock'}
                          onClick={() => handleCancelOrder(order)}
                        >
                          <XCircle size={14} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Modal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={`Sales Order: ${selectedOrder.orderNumber}`}
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedOrder.status === 'PENDING' && (
                  <button
                    className="btn btn-success btn-sm"
                    disabled={!isAdmin || actionLoading}
                    onClick={() => handleConfirmOrder(selectedOrder.id)}
                  >
                    <CheckCircle2 size={14} /> Confirm & Reserve Stock
                  </button>
                )}
                {(selectedOrder.status === 'PENDING' || selectedOrder.status === 'CONFIRMED') && (
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={!isAdmin || actionLoading}
                    onClick={() => handleCancelOrder(selectedOrder)}
                  >
                    <XCircle size={14} /> Cancel Order
                  </button>
                )}
              </div>

              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)}>
                Close
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Customer</span>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{selectedOrder.customer?.companyName}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                City: {selectedOrder.customer?.city} • Contact: {selectedOrder.customer?.contactPerson}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Lifecycle State</span>
              <div>
                <Badge status={selectedOrder.status} />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Order Date: {new Date(selectedOrder.orderDate).toLocaleDateString()}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Order Value</span>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#4f46e5' }}>
                ₹{Number(selectedOrder.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>
            Order Line Items & Live Inventory Status:
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Name</th>
                <th>Order Qty</th>
                <th>Live Available Stock</th>
                <th>Unit Price</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrder.items?.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.productCode}</td>
                  <td>{item.productName}</td>
                  <td>
                    <strong>{item.quantity}</strong> {item.unit}
                  </td>
                  <td>
                    {item.availableStock !== undefined ? (
                      <span
                        style={{
                          fontWeight: 600,
                          color: item.hasSufficientStock ? '#059669' : '#dc2626',
                          background: item.hasSufficientStock ? '#ecfdf5' : '#fef2f2',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {item.availableStock} {item.unit} available
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </td>
                  <td>₹{Number(item.unitPrice).toFixed(2)}</td>
                  <td>
                    <strong>₹{Number(item.lineAmount).toFixed(2)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedOrder.dispatch && (
            <div style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Truck size={16} /> Dispatched via {selectedOrder.dispatch.vehicleNumber}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '2px' }}>
                Dispatch #{selectedOrder.dispatch.dispatchNumber} • Driver: {selectedOrder.dispatch.driverName}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
