import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onLoginSuccess }) {
  const [loginMode, setLoginMode] = useState('creator'); // 'creator' | 'qcstar'

  // Creator / Agency fields
  const [showId, setShowId] = useState('');

  // QCstar / Admin fields
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // 1. Creator / Agency Login via Show ID (POC Phone Number)
  const handleCreatorLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const cleanShowId = showId.trim();

    const { data, error } = await supabase
      .from('qc_shows')
      .select('*')
      .eq('show_id', cleanShowId);

    setLoading(false);

    if (error) {
      setMessage({ type: 'error', text: 'Connection error: ' + error.message });
      return;
    }

    if (!data || data.length === 0) {
      setMessage({
        type: 'error',
        text: 'Invalid Show ID (POC Phone Number). Please check with your assigned QCstar.',
      });
      return;
    }

    const activeShows = data.filter((s) => s.status !== 'ended');

    if (activeShows.length === 0) {
      setMessage({
        type: 'error',
        text: 'All shows linked to this Show ID have been ended by your QCstar. Please contact your QCstar for assistance.',
      });
      return;
    }

    const primaryShow = activeShows[0];
    onLoginSuccess({
      id: primaryShow.id,
      role: 'creator',
      show_id: cleanShowId,
      full_name: `${primaryShow.creator_name} (${primaryShow.agency_name})`,
      email: `show-${cleanShowId}@gyanqc.local`,
      show: primaryShow,
      shows: activeShows,
    });
  };

  // 2. QCstar / Admin Login via Email
  const handleQcstarLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase
      .from('qc_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    setLoading(false);

    if (error) {
      setMessage({ type: 'error', text: 'Connection error: ' + error.message });
      return;
    }

    if (!data) {
      setIsRequestingAccess(true);
      setMessage({
        type: 'info',
        text: 'QCstar email not found. Enter your full name below to request access from Admin.',
      });
      return;
    }

    if (data.status === 'pending') {
      setMessage({
        type: 'warning',
        text: 'Your QCstar access request is still pending Admin approval.',
      });
      return;
    }

    if (data.status === 'rejected') {
      setMessage({
        type: 'error',
        text: 'Your access was revoked or rejected. Contact your Admin.',
      });
      return;
    }

    onLoginSuccess(data);
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.from('qc_users').insert([
      {
        email: cleanEmail,
        full_name: fullName.trim(),
        role: 'qcstar',
        status: 'pending',
      },
    ]);

    setLoading(false);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to submit request: ' + error.message });
    } else {
      setIsRequestingAccess(false);
      setMessage({
        type: 'success',
        text: 'Request sent! Once Admin approves your QCstar account, you can sign in.',
      });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoBadge}>G</div>
          <h1 style={styles.title}>GyanQC</h1>
        </div>
        <p style={styles.subtitle}>Video Quality Control & Show Operations Portal</p>

        {/* Role Switcher Tabs */}
        <div style={styles.tabRow}>
          <button
            type="button"
            onClick={() => {
              setLoginMode('creator');
              setMessage({ type: '', text: '' });
            }}
            style={loginMode === 'creator' ? styles.activeTab : styles.tab}
          >
            Creator / Agency
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginMode('qcstar');
              setMessage({ type: '', text: '' });
            }}
            style={loginMode === 'qcstar' ? styles.activeTab : styles.tab}
          >
            QCstar / Admin
          </button>
        </div>

        {message.text && (
          <div
            style={{
              ...styles.alert,
              backgroundColor:
                message.type === 'error'
                  ? '#fee2e2'
                  : message.type === 'success'
                  ? '#dcfce7'
                  : '#fef3c7',
              color:
                message.type === 'error'
                  ? '#991b1b'
                  : message.type === 'success'
                  ? '#166534'
                  : '#92400e',
            }}
          >
            {message.text}
          </div>
        )}

        {loginMode === 'creator' ? (
          <form onSubmit={handleCreatorLogin} style={styles.form}>
            <label style={styles.label}>Show ID (POC Phone Number)</label>
            <input
              type="text"
              required
              placeholder="e.g. 9876543210"
              value={showId}
              onChange={(e) => setShowId(e.target.value)}
              style={styles.input}
            />

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Verifying Show...' : 'Open Show Workspace'}
            </button>
          </form>
        ) : !isRequestingAccess ? (
          <form onSubmit={handleQcstarLogin} style={styles.form}>
            <label style={styles.label}>QCstar / Admin Email</label>
            <input
              type="email"
              required
              placeholder="name@gyantv.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Checking Access...' : 'Sign In as QCstar / Admin'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestAccess} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input type="email" disabled value={email} style={{ ...styles.input, opacity: 0.7 }} />

            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Verma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={styles.input}
            />

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Sending Request...' : 'Request QCstar Access'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRequestingAccess(false);
                setMessage({ type: '', text: '' });
              }}
              style={styles.linkBtn}
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '430px',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '32px',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  logoBadge: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    margin: '0 0 20px 0',
    fontSize: '14px',
    color: '#64748b',
  },
  tabRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    backgroundColor: '#f1f5f9',
    padding: '4px',
    borderRadius: '10px',
    marginBottom: '20px',
    gap: '4px',
  },
  tab: {
    padding: '9px 10px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  activeTab: {
    padding: '9px 10px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#1e3a8a',
    fontSize: '13px',
    fontWeight: '700',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    cursor: 'pointer',
  },
  alert: {
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    marginTop: '6px',
    padding: '11px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '4px',
  },
};