import React, { useState, useEffect } from 'react';
import { productApi } from '../api/products';
import { Product } from '../types';
import { Package, Search, Tag } from 'lucide-react';

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await productApi.getAll();
        setProducts(data);
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const categories = ['ALL', ...new Set(products.map((p) => p.category))];

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="table-container">
      <div className="table-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={20} color="#4f46e5" />
          <span className="table-title">Product Catalog</span>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({products.length} SKUs)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            className="form-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: '160px' }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Categories' : c}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}
            />
            <input
              type="text"
              placeholder="Search code or name..."
              className="form-input"
              style={{ paddingLeft: '34px', width: '220px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading products...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No matching products.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU Code</th>
              <th>Product Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Base Price</th>
              <th>Stock Breakdown</th>
              <th>Authoritative Availability</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((prod) => {
              const inv = prod.inventory;
              const phys = inv ? inv.physicalQuantity : 0;
              const res = inv ? inv.reservedQuantity : 0;
              const dam = inv ? inv.damagedQuantity : 0;
              const avail = Math.max(0, phys - res - dam);

              return (
                <tr key={prod.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                      {prod.code}
                    </span>
                  </td>
                  <td>
                    <strong>{prod.name}</strong>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                      <Tag size={12} /> {prod.category}
                    </span>
                  </td>
                  <td>{prod.unit}</td>
                  <td>₹{Number(prod.basePrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '10px' }}>
                      <span>Phys: {phys}</span>
                      <span>Res: {res}</span>
                      <span>Dam: {dam}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 700,
                        color: avail > 10 ? '#10b981' : avail > 0 ? '#f59e0b' : '#ef4444',
                        background: avail > 10 ? '#ecfdf5' : avail > 0 ? '#fffbeb' : '#fef2f2',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {avail} {prod.unit} available
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
