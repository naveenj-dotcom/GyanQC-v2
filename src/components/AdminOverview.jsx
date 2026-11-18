import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import ActiveShowSearchBar from './ActiveShowSearchBar';

export default function AdminOverview({ onOpenShowInQC, onOpenTeam }) {
  const [shows, setShows] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [userCount, setUserCount] = useState({ total: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    const [{ data: shw }, { data: eps }, { data: usrs }] = await Promise.all([
      supabase.from('qc_shows').select('*').order('created_at', { ascending: false }),
      supabase.from('qc_episodes').select('*'),
      supabase.from('qc_users').select('id, status'),
    ]);

    if (shw) setShows(shw);
    if (eps) setEpisodes(eps);
    if (usrs) {
      setUserCount({
        total: usrs.filter((u) => u.status === 'approved').length,
        pending: usrs.filter((u) => u.status === 'pending').length,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingEps = episodes.filter((e) => e.status === 'Pending').length;
  const changesEps = episodes.filter((e) => e.status === 'Changes Requested').length;
  const approvedEps = episodes.filter((e) => e.status === 'Approved').length;

  // Map pending QC counts by show_uuid for the search dropdown badges
  const pendingCountsByShow = {};
  for (const ep of episodes) {
    if (ep.status !== 'Approved' && ep.status !== 'Not Submitted') {
      pendingCountsByShow[ep.show_uuid] = (pendingCountsByShow[ep.show_uuid] || 0) + 1;
    }
  }

  const q = showSearch.trim().toLowerCase();
  const filteredShows = shows.filter((s) => {
    if (!q) return true;
    return (
      (s.show_name || '').toLowerCase().includes(q) ||
      (s.show_id || '').toLowerCase().includes(q) ||
      (s.creator_id || '').toLowerCase().includes(q) ||
      (s.agency_name || '').toLowerCase().includes(q) ||
      (s.creator_name || '').toLowerCase().includes(q) ||
      (s.created_by_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '20px' }}>
      <div style={styles.kpiGrid}>
        <div className="panel" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Active Shows</span>
          <strong style={{ ...styles.kpiValue, color: '#0f172a' }}>{shows.length}</strong>
        </div>
        <div className="panel" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Episodes Pending QC</span>
          <strong style={{ ...styles.kpiValue, color: '#d97706' }}>{pendingEps}</strong>
        </div>
        <div className="panel" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Changes Requested</span>
          <strong style={{ ...styles.kpiValue, color: '#dc2626' }}>{changesEps}</strong>
        </div>
        <div className="panel" style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Approved Episodes</span>
          <strong style={{ ...styles.kpiValue, color: '#16a34a' }}>{approvedEps}</strong>
        </div>
        <div
          className="panel"
          style={{ ...styles.kpiCard, cursor: 'pointer', border: '1px solid #bfdbfe' }}
          onClick={onOpenTeam}
        >
          <span style={styles.kpiLabel}>QCstar Team / Pending</span>
          <strong style={{ ...styles.kpiValue, color: '#1e3a8a' }}>
            {userCount.total} / {userCount.pending} pending
          </strong>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '20px' }}>
        <div className="panel-heading">
          <div>
            <h3>All Shows & Operations Overview ({shows.length})</h3>
            <p>Shows created by QCstars, login credentials (Show Name + POC Phone), and episode progress.</p>
          </div>
          <button type="button" onClick={loadData} className="secondary-button">
            Refresh
          </button>
        </div>

        {!loading && shows.length > 0 && (
          <ActiveShowSearchBar
            shows={shows}
            searchQuery={showSearch}
            onSearchChange={setShowSearch}
            pendingCountsByShow={pendingCountsByShow}
            onSelectShow={(s) => onOpenShowInQC(s)}
          />
        )}

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading shows...</p>
        ) : shows.length === 0 ? (
          <p style={{ color: '#64748b' }}>No Shows created yet. Switch to QCstar Studio to create a Show.</p>
        ) : filteredShows.length === 0 ? (
          <p style={{ color: '#64748b', padding: '14px 0' }}>
            No Shows matching "<strong>{showSearch}</strong>". Try another Show Name, Creator, or ID.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Show Name</th>
                  <th style={styles.th}>Show ID (POC Phone)</th>
                  <th style={styles.th}>Agency</th>
                  <th style={styles.th}>Creator</th>
                  <th style={styles.th}>Created By (QCstar)</th>
                  <th style={styles.th}>Episodes Progress</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredShows.map((s) => {
                  const showEps = episodes.filter((e) => e.show_uuid === s.id);
                  const submittedCount = showEps.filter((e) => e.status !== 'Not Submitted').length;
                  const approvedCount = showEps.filter((e) => e.status === 'Approved').length;

                  return (
                    <tr key={s.id} style={styles.tr}>
                      <td style={styles.td}><strong>{s.show_name}</strong></td>
                      <td style={styles.td}>
                        <code style={styles.codeBadge}>{s.show_id}</code>
                      </td>
                      <td style={styles.td}>{s.agency_name}</td>
                      <td style={styles.td}>{s.creator_name}</td>
                      <td style={styles.td}>{s.created_by_name}</td>
                      <td style={styles.td}>
                        {approvedCount} Approved / {submittedCount} Submitted
                      </td>
                      <td style={styles.td}>
                        <button
                          type="button"
                          onClick={() => onOpenShowInQC(s)}
                          className="secondary-button"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          Open Show in QC
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '14px',
  },
  kpiCard: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px 18px' },
  kpiLabel: { fontSize: '12px', fontWeight: '600', color: '#64748b' },
  kpiValue: { fontSize: '24px', fontWeight: '700' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #e2e8f0', color: '#475569' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '12px 10px' },
  codeBadge: {
    backgroundColor: '#f1f5f9',
    padding: '3px 8px',
    borderRadius: '6px',
    fontWeight: '700',
    color: '#1e3a8a',
  },
};
