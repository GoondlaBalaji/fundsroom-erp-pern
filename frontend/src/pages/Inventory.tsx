import React, { useState, useEffect } from 'react';
import { inventoryApi } from '../api/inventory';
import { InventoryViewItem } from '../types';
import { Layers, Info, Search } from 'lucide-react';

export const Inventory: React.FC = () => {
  const [inventories, setInventories] = useState<InventoryViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const data = await inventoryApi.getAll();
      setInventories(data);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const filtered = inventories.filter(
    (item) =>
      item.productCode.toLowerCase().includes(search.toLowerCase()) ||
      item.productName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Informative availability formula callout */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <Info size={22} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.875rem', color: '#1e3a8a' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Authoritative Backend Stock Calculation Model
          </div>
          <div>
            Every availability calculation is strictly computed by the backend using:{' '}
            <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              available = physical_quantity - reserved_quantity - damaged_quantity
            </code>
            . Reserved quantity increases on confirmed sales orders and decreases only upon dispatch or cancellation.
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="#4f46e5" />
            <span className="table-title">Inventory Control Matrix</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({inventories.length} SKU tracked)</span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}
            />
            <input
              type="text"
              placeholder="Search SKU or product..."
              className="form-input"
              style={{ paddingLeft: '34px', width: '240px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading inventory balances...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No inventory records found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Details</th>
                <th>Physical Stock</th>
                <th>Reserved Stock</th>
                <th>Damaged / Quarantine</th>
                <th>Net Sellable (Available)</th>
                <th>Stock Health</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const isHealthy = inv.availableQuantity > 15;
                const isWarning = inv.availableQuantity > 0 && inv.availableQuantity <= 15;

                return (
                  <tr key={inv.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                        {inv.productCode}
                      </span>
                    </td>
                    <td>
                      <strong>{inv.productName}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.category} • {inv.unit}</div>
                    </td>
                    <td>
                      <strong style={{ fontSize: '0.95rem' }}>{inv.physicalQuantity}</strong> {inv.unit}
                    </td>
                    <td>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>
                        {inv.reservedQuantity}
                      </span>{' '}
                      {inv.unit}
                    </td>
                    <td>
                      <span style={{ color: inv.damagedQuantity > 0 ? '#ef4444' : '#64748b' }}>
                        {inv.damagedQuantity}
                      </span>{' '}
                      {inv.unit}
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: isHealthy ? '#059669' : isWarning ? '#d97706' : '#dc2626',
                        }}
                      >
                        {inv.availableQuantity} {inv.unit}
                      </span>
                    </td>
                    <td>
                      {isHealthy ? (
                        <span className="badge badge-won">Optimal Stock</span>
                      ) : isWarning ? (
                        <span className="badge badge-quoted">Low Buffer</span>
                      ) : (
                        <span className="badge badge-lost">Out of Stock</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
