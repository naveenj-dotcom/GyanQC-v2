import { useEffect, useRef, useState } from 'react';

export default function ShowSearchSelect({ shows, selectedShow, onSelectShow }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const filteredShows = trimmed
    ? shows.filter(
        (s) =>
          (s.show_name || '').toLowerCase().includes(trimmed) ||
          (s.show_id || '').toLowerCase().includes(trimmed) ||
          (s.creator_id || '').toLowerCase().includes(trimmed)
      )
    : shows;

  const handleChoose = (showItem) => {
    onSelectShow(showItem);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} style={searchStyles.container}>
      <div style={searchStyles.inputBox}>
        <span style={searchStyles.searchIcon}>🔍</span>
        <input
          type="text"
          aria-label="Search assigned shows"
          value={isOpen ? query : query || selectedShow?.show_name || ''}
          placeholder={`Search ${shows.length} shows by name or ID...`}
          onFocus={() => {
            setQuery('');
            setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          style={searchStyles.input}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(true);
            }}
            style={searchStyles.clearBtn}
            title="Clear search"
          >
            ✕
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            style={searchStyles.toggleBtn}
            title="Show all shows"
          >
            {isOpen ? '▲' : '▼'}
          </button>
        )}
      </div>

      {isOpen && (
        <div style={searchStyles.dropdown}>
          <div style={searchStyles.dropdownHeader}>
            <span>
              {trimmed
                ? `Matching Shows (${filteredShows.length} of ${shows.length})`
                : `All Assigned Shows (${shows.length})`}
            </span>
            {selectedShow?.show_name && (
              <span style={{ color: '#1e3a8a', fontWeight: '700' }}>
                Active: {selectedShow.show_name}
              </span>
            )}
          </div>

          {filteredShows.length === 0 ? (
            <div style={searchStyles.emptyRow}>
              No shows matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div style={searchStyles.list}>
              {filteredShows.map((s, idx) => {
                const isSelected = selectedShow?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleChoose(s)}
                    style={{
                      ...searchStyles.optionRow,
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      borderLeft: isSelected
                        ? '3px solid #1e3a8a'
                        : '3px solid transparent',
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          {s.show_name}
                        </strong>
                        {idx === 0 && !trimmed && (
                          <span style={searchStyles.latestTag}>LATEST</span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Show ID: {s.show_id || s.creator_id || '—'}
                      </span>
                    </div>

                    {isSelected && (
                      <span style={searchStyles.selectedBadge}>✓ Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const searchStyles = {
  container: {
    position: 'relative',
    width: '100%',
    minWidth: '280px',
    maxWidth: '440px',
    flex: '1 1 320px',
  },
  inputBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    padding: '0 10px',
    height: '42px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  searchIcon: {
    fontSize: '14px',
    marginRight: '8px',
    opacity: 0.75,
  },
  input: {
    border: 'none',
    outline: 'none',
    width: '100%',
    fontSize: '14px',
    fontWeight: '600',
    color: '#0f172a',
    backgroundColor: 'transparent',
  },
  clearBtn: {
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '6px',
    padding: '3px 7px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#475569',
    cursor: 'pointer',
  },
  toggleBtn: {
    background: 'transparent',
    border: 'none',
    padding: '4px 6px',
    fontSize: '11px',
    color: '#64748b',
    cursor: 'pointer',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    border: '1.5px solid #cbd5e1',
    borderRadius: '12px',
    boxShadow: '0 14px 28px rgba(15, 23, 42, 0.14)',
    zIndex: 950,
    overflow: 'hidden',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
  },
  list: {
    maxHeight: '260px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  optionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
  },
  latestTag: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    padding: '1px 6px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: '800',
  },
  selectedBadge: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#1e3a8a',
    backgroundColor: '#dbeafe',
    padding: '2px 8px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  },
  emptyRow: {
    padding: '16px 12px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#64748b',
  },
};