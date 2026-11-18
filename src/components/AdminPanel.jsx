import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('qc_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAdding(true);
    const { error } = await supabase.from('qc_users').insert([
      {
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: 'qcstar',
        status: 'approved',
      },
    ]);

    if (error) {
      alert('Error adding QCstar: ' + error.message);
    } else {
      setNewName('');
      setNewEmail('');
      fetchUsers();
    }
    setAdding(false);
  };

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase
      .from('qc_users')
      .update({ status: newStatus })
      .eq('id', id);

    if (!error) fetchUsers();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>QCstar Team & Approvals</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Create QCstar accounts or approve incoming QCstar requests
            </p>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕ Close</button>
        </div>

        <form onSubmit={handleAddMember} style={styles.addForm}>
          <input
            type="text"
            required
            placeholder="QCstar Full Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={styles.input}
          />
          <input
            type="email"
            required
            placeholder="QCstar Work Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={styles.input}
          />
          <button type="submit" disabled={adding} style={styles.addBtn}>
            {adding ? 'Creating...' : '+ Add & Approve QCstar'}
          </button>
        </form>

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading QCstar team...</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={styles.tr}>
                    <td style={styles.td}><strong>{u.full_name}</strong></td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>
                      <span style={u.role === 'admin' ? styles.adminTag : styles.memberTag}>
                        {u.role === 'admin' ? 'Admin' : 'QCstar'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          backgroundColor:
                            u.status === 'approved'
                              ? '#dcfce7'
                              : u.status === 'pending'
                              ? '#fef3c7'
                              : '#fee2e2',
                          color:
                            u.status === 'approved'
                              ? '#166534'
                              : u.status === 'pending'
                              ? '#92400e'
                              : '#991b1b',
                        }}
                      >
                        {u.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {u.role !== 'admin' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {u.status !== 'approved' && (
                            <button
                              onClick={() => updateStatus(u.id, 'approved')}
                              style={styles.approveBtn}
                            >
                              Approve
                            </button>
                          )}
                          {u.status !== 'rejected' && (
                            <button
                              onClick={() => updateStatus(u.id, 'rejected')}
                              style={styles.revokeBtn}
                            >
                              {u.status === 'pending' ? 'Reject' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '780px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },
  closeBtn: {
    background: '#f1f5f9',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  addForm: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: '180px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
  },
  addBtn: {
    padding: '10px 16px',
    backgroundColor: '#1e3a8a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #e2e8f0', color: '#475569' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '12px 10px' },
  adminTag: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
  },
  memberTag: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
  },
  statusBadge: { padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' },
  approveBtn: {
    backgroundColor: '#16a34a',
    color: '#fff',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  },
  revokeBtn: {
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  },
};