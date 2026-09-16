import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Package, Lock, Mail, AlertCircle, Shield, UserCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillCredentials = (fillEmail: string) => {
    setEmail(fillEmail);
    setPassword('Password@123');
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '40px 32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: '#eef2ff',
              color: '#4f46e5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <Package size={32} />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a' }}>Fundsroom ERP</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '6px' }}>
            PERN Manufacturing & Supply Chain Portal
          </p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={18}
                style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }}
              />
              <input
                type="email"
                required
                className="form-input"
                style={{ paddingLeft: '38px', width: '100%' }}
                placeholder="name@fundsroom.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={18}
                style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }}
              />
              <input
                type="password"
                required
                className="form-input"
                style={{ paddingLeft: '38px', width: '100%' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In to Portal'}
          </button>
        </form>

        {/* Demo Credentials Quick Click */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
          <div
            style={{
              fontSize: '0.75rem',
              color: '#64748b',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            Quick Fill Demo Accounts
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleFillCredentials('admin@fundsroom.com')}
              style={{ display: 'flex', flexDirection: 'column', padding: '8px', textAlign: 'left', alignItems: 'flex-start' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#d97706' }}>
                <Shield size={14} /> Admin User
              </div>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Full ERP & Dispatch control</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleFillCredentials('sales@fundsroom.com')}
              style={{ display: 'flex', flexDirection: 'column', padding: '8px', textAlign: 'left', alignItems: 'flex-start' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#059669' }}>
                <UserCheck size={14} /> Sales User
              </div>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Enquiry & Quotation workflow</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
