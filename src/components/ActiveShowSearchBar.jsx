import { useState, useRef, useEffect } from 'react';

export default function ActiveShowSearchBar({
  shows = [],
  searchQuery,
  onSearchChange,
  pendingCountsByShow = {},
  onSelectShow,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const quickMatches = q
    ? shows.filter(
        (s) =>
          (s.show_name || '').toLowerCase().includes(q) ||
          (s.creator_name || '').toLowerCase().includes(q) ||
          (s.creator_id || s.show_id || '').toLowerCase().includes(q)
      )
    : [];

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.barRow}>
        <span style={styles.searchIcon} aria-hidden="true">
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onFocus={() => setDropdownOpen(true)}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setDropdownOpen(true);
          }}
          placeholder={`Search ${shows.length} active shows by Show Name, Creator, or Creator ID...`}
          style={styles.input}
        />
        {searchQuery && (
          <span style={styles.countBadge}>
            {quickMatches.length} of {shows.length}
          </span>
        )}
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              setDropdownOpen(false);
            }}
            style={styles.clearBtn}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {dropdownOpen && q && quickMatches.length > 0 && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            Quick Jump ({quickMatches.length} matching {quickMatches.length === 1 ? 'show' : 'shows'})
          </div>
          {quickMatches.slice(0, 12).map((s) => {
            const pendingCount = pendingCountsByShow[s.id] || 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  if (onSelectShow) onSelectShow(s, 'pending');
                }}
                style={styles.dropdownItem}
              >
                <div style={{ textAlign: 'left' }}>
                  <strong style={{ color: '#0f172a', fontSize: '14px', display: 'block' }}>
                    {s.show_name}
                  </strong>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>
                    Creator: {s.creator_name || 'Unassigned'}
                    {s.creator_id ? ` · ${s.creator_id}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {pendingCount > 0 && (
                    <span style={styles.pendingPill}>{pendingCount} Pending</span>
                  )}
                  <span style={{ color: '#2563eb', fontWeight: '700', fontSize: '12px' }}>
                    Open →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    width: '100%',
    marginBottom: '18px',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#f8fafc',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    padding: '4px 12px',
    boxSizing: 'border-box',
    gap: '8px',
  },
  searchIcon: {
    fontSize: '15px',
    color: '#64748b',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    width: '100%',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    padding: '9px 4px',
    fontSize: '14px',
    color: '#0f172a',
  },
  countBadge: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#1e3a8a',
    backgroundColor: '#dbeafe',
    padding: '3px 9px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  },
  clearBtn: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
    border: 'none',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
    zIndex: 50,
    maxHeight: '280px',
    overflowY: 'auto',
  },
  dropdownHeader: {
    padding: '8px 14px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: '#64748b',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  dropdownItem: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: 'none',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
  },
  pendingPill: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '800',
    padding: '2px 8px',
    borderRadius: '999px',
  },
};
