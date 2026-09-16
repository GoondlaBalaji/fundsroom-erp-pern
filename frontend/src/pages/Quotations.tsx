import React, { useState, useEffect } from 'react';
import { quotationApi, CreateQuotationInput } from '../api/quotations';
import { enquiryApi } from '../api/enquiries';
import { productApi } from '../api/products';
import { Quotation, Enquiry, Product, QuotationStatus } from '../types';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { FileText, Plus, Eye, ArrowRight, AlertCircle } from 'lucide-react';

export const Quotations: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Form state
  const [selectedEnquiryId, setSelectedEnquiryId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [formItems, setFormItems] = useState<
    Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      discountPct: number;
      gstPct: number;
    }>
  >([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [qtns, enqs, prods] = await Promise.all([
        quotationApi.getAll(),
        enquiryApi.getAll(),
        productApi.getAll(),
      ]);
      setQuotations(qtns);
      setEnquiries(enqs);
      setProducts(prods);

      if (enqs.length > 0 && !selectedEnquiryId) {
        populateFormFromEnquiry(enqs[0].id, enqs, prods);
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

  const populateFormFromEnquiry = (enqId: string, allEnqs: Enquiry[], allProds: Product[]) => {
    setSelectedEnquiryId(enqId);
    const enq = allEnqs.find((e) => e.id === enqId);
    if (!enq) return;

    // Set default validUntil to 14 days from now
    const defaultDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    setValidUntil(defaultDate);

    // Populate lines from enquiry
    const items = enq.items.map((item) => {
      const prod = allProds.find((p) => p.id === item.productId);
      const basePrice = prod ? Number(prod.basePrice) : 1000;
      return {
        productId: item.productId,
        productName: prod ? prod.name : 'Product',
        quantity: item.quantity,
        unitPrice: basePrice,
        discountPct: 0,
        gstPct: 18,
      };
    });
    setFormItems(items);
  };

  const handleEnquirySelect = (enqId: string) => {
    populateFormFromEnquiry(enqId, enquiries, products);
  };

  const handleItemChange = (
    index: number,
    field: 'unitPrice' | 'discountPct' | 'gstPct' | 'quantity',
    value: number
  ) => {
    const next = [...formItems];
    next[index] = { ...next[index], [field]: value };
    setFormItems(next);
  };

  // Authoritative real-time preview of calculation matching backend rules
  const previewTotals = formItems.reduce(
    (acc, item) => {
      const base = item.quantity * item.unitPrice;
      const discount = Math.round((base * (item.discountPct / 100)) * 100) / 100;
      const net = Math.round((base - discount) * 100) / 100;
      const gst = Math.round((net * (item.gstPct / 100)) * 100) / 100;
      const line = Math.round((net + gst) * 100) / 100;

      acc.subtotal += base;
      acc.totalDiscount += discount;
      acc.totalGst += gst;
      acc.grandTotal += line;
      return acc;
    },
    { subtotal: 0, totalDiscount: 0, totalGst: 0, grandTotal: 0 }
  );

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateQuotationInput = {
        enquiryId: selectedEnquiryId,
        validUntil: new Date(validUntil).toISOString(),
        clientGrandTotal: Math.round(previewTotals.grandTotal * 100) / 100,
        items: formItems.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountPct: Number(i.discountPct),
          gstPct: Number(i.gstPct),
        })),
      };

      await quotationApi.create(payload);
      setIsCreateOpen(false);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Quotation creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (quotationId: string, status: QuotationStatus) => {
    try {
      await quotationApi.updateStatus(quotationId, status);
      await fetchData();
      if (selectedQuotation && selectedQuotation.id === quotationId) {
        setSelectedQuotation((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (err: any) {
      alert(err.message || 'Status transition rejected');
    }
  };

  const handleConvertToOrder = async (quotationId: string) => {
    setConvertingId(quotationId);
    try {
      const order = await quotationApi.convertToSalesOrder(quotationId);
      alert(`Successfully generated Sales Order: ${order.orderNumber}! Originating enquiry marked as WON.`);
      await fetchData();
      if (selectedQuotation && selectedQuotation.id === quotationId) {
        setSelectedQuotation(null);
      }
    } catch (err: any) {
      alert(`Conversion rejected: ${err.message}`);
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <div>
      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#4f46e5" />
            <span className="table-title">Sales Quotations</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({quotations.length} total)</span>
          </div>

          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} />
            <span>New Quotation</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No quotations created yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Quotation #</th>
                <th>Enquiry #</th>
                <th>Customer</th>
                <th>Valid Until</th>
                <th>Grand Total (INR)</th>
                <th>Status</th>
                <th>Sales Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((qtn) => (
                <tr key={qtn.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                      {qtn.quotationNumber}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {qtn.enquiry?.enquiryNumber}
                    </span>
                  </td>
                  <td>
                    <strong>{qtn.customer?.companyName}</strong>
                  </td>
                  <td>{new Date(qtn.validUntil).toLocaleDateString()}</td>
                  <td>
                    <strong>
                      ₹{Number(qtn.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                  <td>
                    <Badge status={qtn.status} />
                  </td>
                  <td>
                    {qtn.salesOrder ? (
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 600 }}>
                        {qtn.salesOrder.orderNumber}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Not Converted</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedQuotation(qtn)}
                      >
                        <Eye size={14} /> View
                      </button>

                      {/* Convert button: STRICTLY enabled only when status === 'ACCEPTED' */}
                      {!qtn.salesOrder && (
                        <button
                          className={`btn btn-sm ${
                            qtn.status === 'ACCEPTED' ? 'btn-success' : 'btn-secondary'
                          }`}
                          disabled={qtn.status !== 'ACCEPTED' || convertingId === qtn.id}
                          title={
                            qtn.status === 'ACCEPTED'
                              ? 'Convert this accepted quotation to a confirmed Sales Order'
                              : 'Quotation must be in ACCEPTED status to convert'
                          }
                          onClick={() => handleConvertToOrder(qtn.id)}
                        >
                          <ArrowRight size={14} />
                          {convertingId === qtn.id ? 'Converting...' : 'Convert to Order'}
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

      {/* View Quotation Details Modal */}
      {selectedQuotation && (
        <Modal
          isOpen={!!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          title={`Quotation: ${selectedQuotation.quotationNumber}`}
          size="large"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Transition status:</span>
                {selectedQuotation.status === 'DRAFT' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleUpdateStatus(selectedQuotation.id, 'SENT')}
                  >
                    Mark SENT
                  </button>
                )}
                {(selectedQuotation.status === 'DRAFT' || selectedQuotation.status === 'SENT') && (
                  <>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleUpdateStatus(selectedQuotation.id, 'ACCEPTED')}
                    >
                      Mark ACCEPTED
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleUpdateStatus(selectedQuotation.id, 'REJECTED')}
                    >
                      Mark REJECTED
                    </button>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedQuotation.status === 'ACCEPTED' && !selectedQuotation.salesOrder && (
                  <button
                    className="btn btn-success"
                    onClick={() => handleConvertToOrder(selectedQuotation.id)}
                    disabled={convertingId === selectedQuotation.id}
                  >
                    <ArrowRight size={16} />
                    {convertingId === selectedQuotation.id ? 'Converting...' : 'Convert to Sales Order'}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setSelectedQuotation(null)}>
                  Close
                </button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Client Info</span>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{selectedQuotation.customer?.companyName}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Enquiry: {selectedQuotation.enquiry?.enquiryNumber}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Status</span>
              <div>
                <Badge status={selectedQuotation.status} />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Valid Until: {new Date(selectedQuotation.validUntil).toLocaleDateString()}
              </div>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Disc %</th>
                <th>GST %</th>
                <th>Line Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedQuotation.items?.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.product?.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.product?.code}</div>
                  </td>
                  <td>{item.quantity}</td>
                  <td>₹{Number(item.unitPrice).toFixed(2)}</td>
                  <td>{Number(item.discountPct)}%</td>
                  <td>{Number(item.gstPct)}%</td>
                  <td>
                    <strong>₹{Number(item.lineAmount).toFixed(2)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Summary Card */}
          <div
            style={{
              marginLeft: 'auto',
              width: '280px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px',
              marginTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Subtotal:</span>
              <span>₹{Number(selectedQuotation.subtotal).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Total Discount:</span>
              <span style={{ color: '#ef4444' }}>-₹{Number(selectedQuotation.totalDiscount).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Total GST:</span>
              <span>+₹{Number(selectedQuotation.totalGst).toFixed(2)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '2px solid #cbd5e1',
                paddingTop: '8px',
                marginTop: '4px',
                fontSize: '1.05rem',
                fontWeight: 700,
              }}
            >
              <span>Grand Total:</span>
              <span style={{ color: '#4f46e5' }}>₹{Number(selectedQuotation.grandTotal).toFixed(2)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Quotation Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Generate Authoritative Quotation"
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="quotation-form" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Generating...' : 'Issue Quotation'}
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

        <form id="quotation-form" onSubmit={handleCreateQuotation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Origination Customer Enquiry *</label>
              <select
                className="form-select"
                required
                value={selectedEnquiryId}
                onChange={(e) => handleEnquirySelect(e.target.value)}
              >
                {enquiries.map((enq) => (
                  <option key={enq.id} value={enq.id}>
                    {enq.enquiryNumber} - {enq.customer?.companyName} ({enq.items?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Quotation Validity Until *</label>
              <input
                type="date"
                required
                className="form-input"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Configure Item Pricing & Taxes:</div>

          {formItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1.2fr 1fr 1fr',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{item.productName}</strong>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Qty: {item.quantity} units</div>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Unit Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={item.unitPrice}
                  onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Discount %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="form-input"
                  value={item.discountPct}
                  onChange={(e) => handleItemChange(idx, 'discountPct', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>GST %</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="form-input"
                  value={item.gstPct}
                  onChange={(e) => handleItemChange(idx, 'gstPct', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Line Total</div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                  ₹
                  {(
                    item.quantity *
                    item.unitPrice *
                    (1 - item.discountPct / 100) *
                    (1 + item.gstPct / 100)
                  ).toFixed(2)}
                </div>
              </div>
            </div>
          ))}

          {/* Authoritative Live Preview */}
          <div
            style={{
              marginLeft: 'auto',
              width: '300px',
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#4338ca' }}>Subtotal:</span>
              <span>₹{previewTotals.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#4338ca' }}>Total Discount:</span>
              <span style={{ color: '#dc2626' }}>-₹{previewTotals.totalDiscount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#4338ca' }}>Total GST:</span>
              <span>+₹{previewTotals.totalGst.toFixed(2)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '2px solid #818cf8',
                paddingTop: '8px',
                marginTop: '4px',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#312e81',
              }}
            >
              <span>Grand Total:</span>
              <span>₹{previewTotals.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
