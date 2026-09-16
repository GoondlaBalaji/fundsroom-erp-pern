import React, { useState, useEffect } from 'react';
import { enquiryApi } from '../api/enquiries';
import { customerApi } from '../api/customers';
import { productApi } from '../api/products';
import { Enquiry, Customer, Product, EnquiryStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { FileQuestion, Plus, Trash2, Eye, AlertCircle } from 'lucide-react';

export const Enquiries: React.FC = () => {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: '', quantity: 1 },
  ]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [enqs, custs, prods] = await Promise.all([
        enquiryApi.getAll(),
        customerApi.getAll(),
        productApi.getAll(),
      ]);
      setEnquiries(enqs);
      setCustomers(custs);
      setProducts(prods);
      if (custs.length > 0 && !customerId) setCustomerId(custs[0].id);
      if (prods.length > 0 && !items[0].productId) {
        setItems([{ productId: prods[0].id, quantity: 5 }]);
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

  const handleAddItem = () => {
    if (products.length > 0) {
      setItems([...items, { productId: products[0].id, quantity: 1 }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, idx) => idx !== index));
    }
  };

  const handleItemChange = (index: number, field: 'productId' | 'quantity', value: any) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const handleCreateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!requiredDate) {
        throw new Error('Please select a valid required delivery date');
      }
      await enquiryApi.create({
        customerId,
        requiredDate: new Date(requiredDate).toISOString(),
        notes: notes || undefined,
        items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
      });
      setIsCreateOpen(false);
      setNotes('');
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (enquiryId: string, status: EnquiryStatus) => {
    try {
      await enquiryApi.updateStatus(enquiryId, status);
      await fetchData();
      if (selectedEnquiry && selectedEnquiry.id === enquiryId) {
        setSelectedEnquiry((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Status update failed');
    }
  };

  return (
    <div>
      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileQuestion size={20} color="#4f46e5" />
            <span className="table-title">Customer Enquiries</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({enquiries.length} total)</span>
          </div>

          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} />
            <span>Create Enquiry</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading enquiries...</div>
        ) : enquiries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No enquiries registered yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Enquiry #</th>
                <th>Customer</th>
                <th>Enquiry Date</th>
                <th>Required Date</th>
                <th>Line Items</th>
                <th>Status</th>
                <th>Quotations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((enq) => (
                <tr key={enq.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                      {enq.enquiryNumber}
                    </span>
                  </td>
                  <td>
                    <strong>{enq.customer?.companyName}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{enq.customer?.contactPerson}</div>
                  </td>
                  <td>{new Date(enq.enquiryDate).toLocaleDateString()}</td>
                  <td>{new Date(enq.requiredDate).toLocaleDateString()}</td>
                  <td>{enq.items?.length || 0} product(s)</td>
                  <td>
                    <Badge status={enq.status} />
                  </td>
                  <td>{enq.quotations?.length || 0} issued</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedEnquiry(enq)}
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

      {/* View Enquiry Details Modal */}
      {selectedEnquiry && (
        <Modal
          isOpen={!!selectedEnquiry}
          onClose={() => setSelectedEnquiry(null)}
          title={`Enquiry Details: ${selectedEnquiry.enquiryNumber}`}
          size="large"
          footer={
            <button className="btn btn-secondary" onClick={() => setSelectedEnquiry(null)}>
              Close
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Customer</span>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selectedEnquiry.customer?.companyName}</div>
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                Contact: {selectedEnquiry.customer?.contactPerson} ({selectedEnquiry.customer?.mobile})
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Current Status</span>
              <div>
                <Badge status={selectedEnquiry.status} />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Created by {selectedEnquiry.createdBy?.fullName} on {new Date(selectedEnquiry.enquiryDate).toLocaleDateString()}
              </div>
            </div>
          </div>

          {selectedEnquiry.notes && (
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
              <strong>Notes / Specs:</strong> {selectedEnquiry.notes}
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>Requested Line Items:</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Name</th>
                <th>Requested Qty</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {selectedEnquiry.items?.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.product?.code}</td>
                  <td>{item.product?.name}</td>
                  <td><strong>{item.quantity}</strong></td>
                  <td>{item.product?.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedEnquiry.status === 'NEW' && (
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Mark status manually:</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleStatusUpdate(selectedEnquiry.id, 'LOST')}
              >
                Mark LOST
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* Create Enquiry Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Customer Enquiry"
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="enquiry-form" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Submit Enquiry'}
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

        <form id="enquiry-form" onSubmit={handleCreateEnquiry} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select
                className="form-select"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Required Delivery Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer Notes / Specifications</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. High-temperature testing certificate required..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Line Items */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Requested Product Items *</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddItem}>
                <Plus size={14} /> Add Line
              </button>
            </div>

            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3fr 1fr 40px',
                  gap: '12px',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <select
                  className="form-select"
                  value={item.productId}
                  onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} (Base: ₹{p.basePrice})
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  className="form-input"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                  required
                />

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#ef4444', padding: '8px' }}
                  onClick={() => handleRemoveItem(idx)}
                  disabled={items.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
};
