import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function QcstarPortal({
  activeTab,
  onNavigate,
  shows,
  onShowCreated,
  onShowEnded,
  onOpenEpisodeInStudio,
  onOpenMonthlyPlanner,
  currentUser,
}) {
  // Tab 1: Full Monthly Master Calendar (All Active Shows)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [allCalendarItems, setAllCalendarItems] = useState([]);
  const [allEpisodes, setAllEpisodes] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Tab 2: Shows -> Pending QC Videos Drilldown state
  const [selectedShowForQueue, setSelectedShowForQueue] = useState(null);
  const [pendingVideos, setPendingVideos] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // End Show Confirmation Popup state
  const [showToEnd, setShowToEnd] = useState(null);
  const [endingShow, setEndingShow] = useState(false);

  // Create New Show Popup state (inside Shows tab)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newShowId, setNewShowId] = useState('');
  const [creatingShow, setCreatingShow] = useState(false);

  // Only show active shows in QCstar's active tabs
  const activeShows = shows.filter((s) => s.status !== 'ended');

  const loadMasterCalendar = async () => {
    setLoadingCalendar(true);

    const [{ data: calItems }, { data: epItems }] = await Promise.all([
      supabase
        .from('qc_show_calendar')
        .select('*')
        .order('schedule_date', { ascending: true }),
      supabase
        .from('qc_episodes')
        .select('id, show_uuid, episode_number, ep_name, status, drive_file_id, drive_url, scheduled_date, feedback'),
    ]);

    setAllCalendarItems(calItems || []);
    setAllEpisodes(epItems || []);
    setLoadingCalendar(false);
  };

  useEffect(() => {
    if (activeTab === 'calendar') {
      loadMasterCalendar();
    }
  }, [activeTab, shows]);

  const shiftMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const handleSelectShowForQueue = async (showObj) => {
    setSelectedShowForQueue(showObj);
    setLoadingQueue(true);

    const { data, error } = await supabase
      .from('qc_episodes')
      .select('*')
      .eq('show_uuid', showObj.id)
      .neq('status', 'Approved')
      .neq('status', 'Not Submitted')
      .order('episode_number', { ascending: true });

    if (!error && data) {
      setPendingVideos(data);
    } else {
      setPendingVideos([]);
    }
    setLoadingQueue(false);
  };

  useEffect(() => {
    if (activeTab !== 'shows') {
      setSelectedShowForQueue(null);
    }
  }, [activeTab]);

  const handleConfirmEndShow = async () => {
    if (!showToEnd) return;
    setEndingShow(true);

    const { error } = await supabase
      .from('qc_shows')
      .update({ status: 'ended' })
      .eq('id', showToEnd.id);

    setEndingShow(false);
    if (error) {
      alert('Error ending Show: ' + error.message);
    } else {
      const endedName = showToEnd.show_name;
      if (selectedShowForQueue?.id === showToEnd.id) {
        setSelectedShowForQueue(null);
      }
      setShowToEnd(null);
      alert(`Show "${endedName}" has been ended.`);
      if (onShowEnded) onShowEnded();
    }
  };

  const handleCreateShowSubmit = async (e) => {
    e.preventDefault();
    setCreatingShow(true);

    const { data: createdShow, error } = await supabase
      .from('qc_shows')
      .insert([
        {
          show_name: newShowName.trim(),
          agency_name: newAgencyName.trim(),
          creator_name: newCreatorName.trim(),
          show_id: newShowId.trim(),
          created_by_email: currentUser.email,
          created_by_name: currentUser.full_name,
          status: 'active',
        },
      ])
      .select('*')
      .single();

    if (error) {
      alert('Error creating Show: ' + error.message);
      setCreatingShow(false);
      return;
    }

    const initialEps = [1, 2, 3, 4, 5].map((num) => ({
      show_uuid: createdShow.id,
      episode_number: num,
      ep_name: '',
      drive_url: '',
      drive_file_id: '',
      scheduled_date: null,
      status: 'Not Submitted',
      feedback: [],
    }));
    await supabase.from('qc_episodes').insert(initialEps);

    setCreatingShow(false);
    setNewShowName('');
    setNewAgencyName('');
    setNewCreatorName('');
    setNewShowId('');
    setShowCreateModal(false);
    alert(`Show "${createdShow.show_name}" created successfully!`);
    onShowCreated(createdShow);
  };

  // HOME SCREEN: Clean 3-Tab Launcher
  if (activeTab === 'home') {
    return (
      <div style={{ maxWidth: '880px', margin: '48px auto', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>
            Welcome, {currentUser.full_name}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '15px', color: '#64748b' }}>
            Select a workspace tab to begin
          </p>
        </div>

        <div style={styles.homeGrid}>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>1</span>
            <strong style={styles.tabTitle}>Calendar</strong>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('shows')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>2</span>
            <strong style={styles.tabTitle}>Shows</strong>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('studio')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>3</span>
            <strong style={styles.tabTitle}>QC Studio</strong>
          </button>
        </div>
      </div>
    );
  }

  // TAB 1: MASTER MONTHLY CALENDAR (ALL ACTIVE SHOWS + EDIT CALENDAR BUTTON)
  if (activeTab === 'calendar') {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const yearNum = Number(yearStr);
    const monthNum = Number(monthStr);
    const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay();
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });

    const enrichedMonthItems = allCalendarItems
      .filter((item) => (item.schedule_date || '').startsWith(selectedMonth))
      .map((item) => {
        const showObj = activeShows.find((s) => s.id === item.show_uuid);
        if (!showObj) return null; // Hide ended shows

        const epMatch = (item.episode_label || '').match(/ep\s*(\d+)/i);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : null;
        const matchingEp = allEpisodes.find(
          (e) => e.show_uuid === item.show_uuid && e.episode_number === epNum
        );
        const isApproved = matchingEp?.status === 'Approved';

        return {
          ...item,
          showObj,
          showName: showObj.show_name,
          matchingEp,
          isApproved,
        };
      })
      .filter(Boolean);

    const calendarCells = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      calendarCells.push({ empty: true, key: `empty-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const itemsForDay = enrichedMonthItems.filter((e) => e.schedule_date === dateIso);
      calendarCells.push({ empty: false, day, dateIso, items: itemsForDay, key: dateIso });
    }

    return (
      <div style={{ maxWidth: '1380px', margin: '0 auto', padding: '20px' }}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Master Show Calendar — {monthLabel}</h3>
              <p>
                Full schedule across all {activeShows.length} active{' '}
                {activeShows.length === 1 ? 'Show' : 'Shows'} ({enrichedMonthItems.length} episodes scheduled).
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="secondary-button"
                style={{ padding: '7px 11px', fontSize: '13px' }}
              >
                ← Prev
              </button>

              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={styles.monthInput}
              />

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="secondary-button"
                style={{ padding: '7px 11px', fontSize: '13px' }}
              >
                Next →
              </button>

              <button
                type="button"
                onClick={onOpenMonthlyPlanner}
                className="primary-button"
                style={{ marginLeft: '6px' }}
              >
                ✏️ Edit Calendar
              </button>
            </div>
          </div>

          {loadingCalendar ? (
            <p style={{ color: '#64748b' }}>Loading master calendar...</p>
          ) : (
            <>
              <div style={styles.weekHeaderGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} style={styles.weekDayHeader}>
                    {d}
                  </div>
                ))}
              </div>

              <div style={styles.calendarGrid}>
                {calendarCells.map((cell) =>
                  cell.empty ? (
                    <div key={cell.key} style={styles.emptyCalendarCell} />
                  ) : (
                    <div
                      key={cell.key}
                      style={{
                        ...styles.calendarCell,
                        backgroundColor: cell.items.length > 0 ? '#eff6ff' : '#ffffff',
                        borderColor: cell.items.length > 0 ? '#93c5fd' : '#e2e8f0',
                      }}
                    >
                      <span style={styles.dayNumber}>{cell.day}</span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' }}>
                        {cell.items.map((item) => {
                          const canReview =
                            !item.isApproved && item.matchingEp?.drive_file_id && item.showObj;
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (canReview) {
                                  onOpenEpisodeInStudio(item.showObj, item.matchingEp);
                                }
                              }}
                              title={
                                canReview
                                  ? 'Click to open this episode in QC Studio'
                                  : `${item.showName} — ${item.episode_label}`
                              }
                              style={{
                                ...styles.masterEventPill,
                                backgroundColor: item.isApproved ? '#15803d' : '#1e3a8a',
                                cursor: canReview ? 'pointer' : 'default',
                              }}
                            >
                              <span style={{ display: 'block', fontSize: '10px', opacity: 0.9, fontWeight: '600' }}>
                                {item.showName}
                              </span>
                              <strong style={{ fontSize: '12px' }}>
                                {item.episode_label} {item.isApproved ? '✓' : ''}
                              </strong>
                              {item.notes && (
                                <span style={{ display: 'block', fontSize: '10px', opacity: 0.85 }}>
                                  {item.notes}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // TAB 2: SHOWS (includes "+ Create New Show" + End Show Confirmation Popup)
  if (activeTab === 'shows') {
    return (
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '20px' }}>
        {!selectedShowForQueue ? (
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>All Active Shows</h3>
                <p>Click on a Show to view videos awaiting QC, create a new Show, or end a completed Show.</p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="primary-button"
              >
                + Create New Show
              </button>
            </div>

            {activeShows.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>No active Shows found.</strong>
                <span>Click "+ Create New Show" above to add a Show.</span>
              </div>
            ) : (
              <div style={styles.showsListGrid}>
                {activeShows.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleSelectShowForQueue(s)}
                    style={styles.showCard}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={styles.showIdTag}>ID: {s.show_id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowToEnd(s);
                        }}
                        style={styles.endShowBtn}
                      >
                        End Show
                      </button>
                    </div>
                    <h4 style={{ margin: '10px 0 4px', fontSize: '18px', color: '#0f172a' }}>
                      {s.show_name}
                    </h4>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748b' }}>
                      Agency: <strong>{s.agency_name}</strong> · Creator: <strong>{s.creator_name}</strong>
                    </p>
                    <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: '700' }}>
                      Open Pending Videos →
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-heading">
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedShowForQueue(null)}
                  className="secondary-button"
                  style={{ marginBottom: '10px', padding: '5px 10px', fontSize: '12px' }}
                >
                  ← Back to All Shows
                </button>
                <h3>{selectedShowForQueue.show_name} — Videos to QC</h3>
                <p>Showing only videos awaiting QC review (approved videos are hidden).</p>
              </div>

              <button
                type="button"
                onClick={() => setShowToEnd(selectedShowForQueue)}
                style={styles.endShowBtnLarge}
              >
                End Show
              </button>
            </div>

            {loadingQueue ? (
              <p style={{ color: '#64748b' }}>Loading videos to QC...</p>
            ) : pendingVideos.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>All caught up! No pending videos to QC for {selectedShowForQueue.show_name}.</strong>
                <span>New submissions from {selectedShowForQueue.creator_name} will appear here automatically.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingVideos.map((ep) => (
                  <div key={ep.id} style={styles.pendingEpRow}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={styles.epPill}>Ep {ep.episode_number}</span>
                        <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                          {ep.ep_name || `Episode ${ep.episode_number}`}
                        </strong>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                        Scheduled Date: <strong>{ep.scheduled_date || 'Not set'}</strong>
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`review-status ${ep.status.toLowerCase().replace(' ', '-')}`}>
                        {ep.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenEpisodeInStudio(selectedShowForQueue, ep)}
                        className="primary-button"
                      >
                        Open in QC Studio →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Confirmation Popup for Ending a Show */}
        {showToEnd && (
          <div style={modalStyles.overlay} onClick={() => !endingShow && setShowToEnd(null)}>
            <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 8px', fontSize: '19px', color: '#0f172a' }}>
                End Show Confirmation
              </h3>
              <p style={{ margin: '0 0 18px', fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
                Are you sure you want to end <strong>{showToEnd.show_name}</strong> (ID:{' '}
                <strong>{showToEnd.show_id}</strong>)?
                <br />
                <span style={{ fontSize: '13px', color: '#991b1b' }}>
                  Once ended, this Show will be removed from active QC queues and Creator/Agency login will be closed.
                </span>
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  disabled={endingShow}
                  onClick={() => setShowToEnd(null)}
                  className="secondary-button"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={endingShow}
                  onClick={handleConfirmEndShow}
                  style={styles.confirmEndBtn}
                >
                  {endingShow ? 'Ending Show...' : 'Yes, End Show'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create New Show Popup inside Shows Tab */}
        {showCreateModal && (
          <div style={modalStyles.overlay} onClick={() => !creatingShow && setShowCreateModal(false)}>
            <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>Create New Show</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Show ID (POC Phone) will be the Creator/Agency login credential.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={creatingShow}
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateShowSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={styles.label}>Show Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Crime Patrol Stories"
                    value={newShowName}
                    onChange={(e) => setNewShowName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Agency Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Red Chillies Digital"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Creator Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikram Mehta"
                    value={newCreatorName}
                    onChange={(e) => setNewCreatorName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Show ID (POC Phone Number) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={newShowId}
                    onChange={(e) => setNewShowId(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <button type="submit" disabled={creatingShow} className="primary-button" style={{ marginTop: '6px' }}>
                  {creatingShow ? 'Creating Show...' : 'Create Show & Generate Login Credentials'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

const styles = {
  homeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '18px',
  },
  homeCard: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    borderRadius: '16px',
    padding: '36px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
    transition: 'all 0.15s ease',
  },
  tabNumber: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '800',
  },
  tabTitle: {
    fontSize: '19px',
    color: '#0f172a',
    fontWeight: '700',
  },
  monthInput: {
    padding: '7px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#ffffff',
    height: '38px',
  },
  weekHeaderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
    marginBottom: '8px',
  },
  weekDayHeader: {
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: '#334155',
    backgroundColor: '#f1f5f9',
    padding: '8px 0',
    borderRadius: '8px',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
  },
  emptyCalendarCell: {
    minHeight: '115px',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '1px dashed #e2e8f0',
  },
  calendarCell: {
    minHeight: '115px',
    height: 'auto',
    border: '1.5px solid #cbd5e1',
    borderRadius: '10px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
  },
  dayNumber: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#0f172a',
  },
  masterEventPill: {
    color: '#ffffff',
    padding: '6px 8px',
    borderRadius: '7px',
    lineHeight: 1.25,
  },
  emptyBox: {
    padding: '28px 20px',
    textAlign: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: '10px',
    border: '1px dashed #cbd5e1',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: '#475569',
    fontSize: '14px',
  },
  epPill: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
  },
  showsListGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: '14px',
  },
  showCard: {
    padding: '16px',
    borderRadius: '10px',
    border: '1.5px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
  },
  showIdTag: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
  },
  endShowBtn: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    padding: '3px 9px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  endShowBtnLarge: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmEndBtn: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  pendingEpRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    flexWrap: 'wrap',
    gap: '12px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '5px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
};

const modalStyles = {
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '440px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
  },
};