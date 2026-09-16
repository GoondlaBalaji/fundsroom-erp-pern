import React, { useState, useEffect } from 'react';
import { customerApi, CreateCustomerInput } from '../api/customers';
import { Customer } from '../types';
import { Modal } from '../components/ui/Modal';
import { Users, Plus, Search, Mail, Phone, MapPin, AlertCircle } from 'lucide-react';

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateCustomerInput>({
    companyName: '',
    contactPerson: '',
    mobile: '',
    email: '',
    city: '',
  });

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await customerApi.getAll();
      setCustomers(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await customerApi.create(formData);
      setIsModalOpen(false);
      setFormData({
        companyName: '',
        contactPerson: '',
        mobile: '',
        email: '',
        city: '',
      });
      await fetchCustomers();
    } catch (err: any) {
      setError(err.message || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="#4f46e5" />
            <span className="table-title">Customer Directory</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({customers.length} total)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}
              />
              <input
                type="text"
                placeholder="Search customers..."
                className="form-input"
                style={{ paddingLeft: '34px', width: '220px' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} />
              <span>Add Customer</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading customer records...</div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No customers found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Contact Person</th>
                <th>Contact Details</th>
                <th>City</th>
                <th>Enquiries</th>
                <th>Quotations</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((cust) => (
                <tr key={cust.id}>
                  <td>
                    <strong>{cust.companyName}</strong>
                  </td>
                  <td>{cust.contactPerson}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} color="#64748b" /> {cust.email}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={12} color="#64748b" /> {cust.mobile}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} color="#64748b" /> {cust.city}
                    </span>
                  </td>
                  <td>{cust._count?.enquiries || 0}</td>
                  <td>{cust._count?.quotations || 0}</td>
                  <td>{cust._count?.salesOrders || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Customer Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Customer"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="customer-form"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Registering...' : 'Save Customer'}
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

        <form id="customer-form" onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Company Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Apex Industrial Solutions Ltd"
              className="form-input"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contact Person *</label>
            <input
              type="text"
              required
              placeholder="e.g. Rajesh Sharma"
              className="form-input"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. +91 9876543210"
                className="form-input"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">City *</label>
              <input
                type="text"
                required
                placeholder="e.g. Pune"
                className="form-input"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              required
              placeholder="e.g. procurement@apexindustries.com"
              className="form-input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
