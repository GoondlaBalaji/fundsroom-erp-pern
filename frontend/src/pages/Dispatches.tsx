import React, { useState, useEffect } from 'react';
import { dispatchApi } from '../api/dispatches';
import { salesOrderApi } from '../api/sales-orders';
import { Dispatch, SalesOrder } from '../types';
import { Modal } from '../components/ui/Modal';
import { Truck, Plus, Eye, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Dispatches: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [confirmedOrders, setConfirmedOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [isProcessOpen, setIsProcessOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [salesOrderId, setSalesOrderId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [dspList, ordersList] = await Promise.all([
        dispatchApi.getAll(),
        salesOrderApi.getAll(),
      ]);
      setDispatches(dspList);

      // Only orders in CONFIRMED status that are NOT yet dispatched
      const readyOrders = ordersList.filter(
        (o) => o.status === 'CONFIRMED' && !o.dispatch
      );
      setConfirmedOrders(readyOrders);

      if (readyOrders.length > 0 && !salesOrderId) {
        setSalesOrderId(readyOrders[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProcessDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Access denied: User role SALES_USER cannot execute dispatches. Admin required.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await dispatchApi.process({
        salesOrderId,
        vehicleNumber: vehicleNumber.trim(),
        driverName: driverName.trim(),
      });
      alert('Dispatch successfully executed! Physical and reserved inventory decremented.');
      setIsProcessOpen(false);
      setVehicleNumber('');
      setDriverName('');
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Dispatch processing failed');
    } finally {
      setSubmitting(false);
    }
  };

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
            You are signed in as <strong>{user?.fullName} (SALES_USER)</strong>. Dispatch tracking is visible, but processing dispatches requires <strong>ADMIN</strong> privileges.
          </span>
        </div>
      )}

      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={20} color="#4f46e5" />
            <span className="table-title">Fulfillment & Dispatch Register</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({dispatches.length} completed)</span>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setIsProcessOpen(true)}
            disabled={!isAdmin || confirmedOrders.length === 0}
            title={
              !isAdmin
                ? 'Admin role required'
                : confirmedOrders.length === 0
                ? 'No CONFIRMED sales orders ready for dispatch'
                : 'Process complete dispatch for a confirmed order'
            }
          >
            <Plus size={16} />
            <span>Process Dispatch ({confirmedOrders.length} ready)</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading dispatch history...</div>
        ) : dispatches.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            No dispatches processed yet. Confirm a sales order to enable dispatch.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Dispatch #</th>
                <th>Sales Order #</th>
                <th>Customer</th>
                <th>Dispatch Date</th>
                <th>Vehicle Number</th>
                <th>Driver Name</th>
                <th>Dispatched By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((dsp) => (
                <tr key={dsp.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#059669' }}>
                      {dsp.dispatchNumber}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      {dsp.salesOrder?.orderNumber}
                    </span>
                  </td>
                  <td>
                    <strong>{dsp.salesOrder?.customer?.companyName}</strong>
                  </td>
                  <td>{new Date(dsp.dispatchDate).toLocaleDateString()}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                      {dsp.vehicleNumber}
                    </span>
                  </td>
                  <td>{dsp.driverName}</td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#475569' }}>{dsp.dispatchedBy?.fullName}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedDispatch(dsp)}
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Dispatch Details Modal */}
      {selectedDispatch && (
        <Modal
          isOpen={!!selectedDispatch}
          onClose={() => setSelectedDispatch(null)}
          title={`Dispatch Note: ${selectedDispatch.dispatchNumber}`}
          size="large"
          footer={
            <button className="btn btn-secondary" onClick={() => setSelectedDispatch(null)}>
              Close
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Customer & Destination</span>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{selectedDispatch.salesOrder?.customer?.companyName}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                City: {selectedDispatch.salesOrder?.customer?.city}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Vehicle & Logistics</span>
              <div style={{ fontWeight: 600, fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
                {selectedDispatch.vehicleNumber}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Driver: <strong>{selectedDispatch.driverName}</strong>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Fulfillment Status</span>
              <div>
                <span className="badge badge-dispatched">FULFILLED</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Date: {new Date(selectedDispatch.dispatchDate).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>Dispatched Line Items:</div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Name</th>
                <th>Dispatched Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {selectedDispatch.items?.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.product?.code}</td>
                  <td>{item.product?.name}</td>
                  <td><strong>{item.quantity}</strong></td>
                  <td>{item.product?.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {/* Process Dispatch Modal */}
      <Modal
        isOpen={isProcessOpen}
        onClose={() => setIsProcessOpen(false)}
        title="Execute Complete Order Dispatch"
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsProcessOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="dispatch-form"
              className="btn btn-primary"
              disabled={submitting || confirmedOrders.length === 0}
            >
              {submitting ? 'Executing Dispatch...' : 'Confirm & Dispatch Order'}
            </button>
          </>
        }
      >
        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 16px', fontSize: '0.85rem', color: '#065f46', marginBottom: '16px' }}>
          <strong>Inventory Fulfillment Rule:</strong> Executing dispatch will atomically decrement both <code>physical_quantity</code> and <code>reserved_quantity</code> for each item, and lock the Sales Order in terminal <code>DISPATCHED</code> state.
        </div>

        <form id="dispatch-form" onSubmit={handleProcessDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Select Confirmed Sales Order *</label>
            <select
              className="form-select"
              required
              value={salesOrderId}
              onChange={(e) => setSalesOrderId(e.target.value)}
            >
              {confirmedOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} — {o.customer?.companyName} (₹{Number(o.totalAmount).toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Transport Vehicle Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. MH-12-TX-9988"
                className="form-input"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Driver Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rajesh Patil"
                className="form-input"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
