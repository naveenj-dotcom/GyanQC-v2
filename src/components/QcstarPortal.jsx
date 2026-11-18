import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Helper to extract Drive File ID and build reliable View & Direct Download URLs
function getDriveLinks(ep) {
  let fileId = (ep?.drive_file_id || '').trim();
  const rawUrl = (ep?.drive_url || '').trim();

  if (!fileId && rawUrl) {
    const match =
      rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
      rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];
  }

  const viewUrl =
    rawUrl || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');
  const downloadUrl = fileId
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : rawUrl;

  return { fileId, viewUrl, downloadUrl };
}

// Sort episodes so most recently submitted / re-edited appear first, then highest episode number
function sortLatestFirst(list) {
  return [...list].sort((a, b) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return (b.episode_number || 0) - (a.episode_number || 0);
  });
}

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

  // Calendar Approved Video Quick-Download Modal
  const [selectedApprovedModal, setSelectedApprovedModal] = useState(null);

  // Tab 2: Shows -> Active vs Ended filter + Pending QC & Approved Videos Drilldown
  const [showsListFilter, setShowsListFilter] = useState('active'); // 'active' | 'ended'
  const [selectedShowForQueue, setSelectedShowForQueue] = useState(null);
  const [queueSubTab, setQueueSubTab] = useState('pending'); // 'pending' | 'approved'
  const [pendingVideos, setPendingVideos] = useState([]);
  const [approvedShowVideos, setApprovedShowVideos] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // End / Reopen Show Confirmation Popup state
  const [showToEnd, setShowToEnd] = useState(null);
  const [endingShow, setEndingShow] = useState(false);
  const [reopeningId, setReopeningId] = useState(null);

  // Create New Show Popup state (inside Shows tab)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newShowId, setNewShowId] = useState('');
  const [creatingShow, setCreatingShow] = useState(false);

  // Latest created show always appears at the top
  const sortedShows = [...shows].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA;
  });

  const activeShows = sortedShows.filter((s) => s.status !== 'ended');
  const endedShows = sortedShows.filter((s) => s.status === 'ended');

  const handleCopyDriveLink = (url, id) => {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadMasterCalendar = async () => {
    setLoadingCalendar(true);

    const [{ data: calItems }, { data: epItems }] = await Promise.all([
      supabase
        .from('qc_show_calendar')
        .select('*')
        .order('schedule_date', { ascending: true }),
      supabase
        .from('qc_episodes')
        .select(
          'id, show_uuid, episode_number, ep_name, status, drive_file_id, drive_url, scheduled_date, feedback, updated_at'
        ),
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

  const handleSelectShowForQueue = async (showObj, initialSubTab = 'pending') => {
    setSelectedShowForQueue(showObj);
    setQueueSubTab(initialSubTab);
    setLoadingQueue(true);

    const { data, error } = await supabase
      .from('qc_episodes')
      .select('*')
      .eq('show_uuid', showObj.id)
      .neq('status', 'Not Submitted');

    if (!error && data) {
      setPendingVideos(sortLatestFirst(data.filter((ep) => ep.status !== 'Approved')));
      setApprovedShowVideos(sortLatestFirst(data.filter((ep) => ep.status === 'Approved')));
    } else {
      setPendingVideos([]);
      setApprovedShowVideos([]);
    }
    setLoadingQueue(false);
  };

  useEffect(() => {
    if (activeTab !== 'shows') {
      setSelectedShowForQueue(null);
    }
  }, [activeTab]);

  // Any QCstar can end ANY active show regardless of who created it
  const handleConfirmEndShow = async () => {
    if (!showToEnd) return;
    setEndingShow(true);

    const { data: updatedRows, error } = await supabase
      .from('qc_shows')
      .update({ status: 'ended' })
      .eq('id', showToEnd.id)
      .select('id, status');

    setEndingShow(false);
    if (error) {
      alert('Error ending Show: ' + error.message);
    } else if (!updatedRows || updatedRows.length === 0) {
      alert(
        'Could not update show status due to database permissions. Please ensure qc_shows update policy allows all QCstars.'
      );
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

  // Any QCstar can also reopen an ended show if needed
  const handleReopenShow = async (showObj) => {
    if (!window.confirm(`Reopen "${showObj.show_name}" and restore it to Active Shows?`)) {
      return;
    }
    setReopeningId(showObj.id);
    const { data: updatedRows, error } = await supabase
      .from('qc_shows')
      .update({ status: 'active' })
      .eq('id', showObj.id)
      .select('id, status');

    setReopeningId(null);
    if (error) {
      alert('Error reopening Show: ' + error.message);
    } else if (!updatedRows || updatedRows.length === 0) {
      alert('Could not reopen show due to database permissions.');
    } else {
      alert(`Show "${showObj.show_name}" is active again.`);
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
            Select a workspace tab to begin · {activeShows.length} active shows
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
            <strong style={styles.tabTitle}>Shows ({activeShows.length})</strong>
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
                Click green approved pills to download from Google Drive.
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
                          const canDownloadApproved = item.isApproved && item.matchingEp;

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (canDownloadApproved) {
                                  setSelectedApprovedModal({
                                    showName: item.showName,
                                    episode: item.matchingEp,
                                    scheduleDate: item.schedule_date,
                                  });
                                } else if (canReview) {
                                  onOpenEpisodeInStudio(item.showObj, item.matchingEp);
                                }
                              }}
                              title={
                                canDownloadApproved
                                  ? 'Approved — Click to open or download from Google Drive'
                                  : canReview
                                  ? 'Click to open this episode in QC Studio'
                                  : `${item.showName} — ${item.episode_label}`
                              }
                              style={{
                                ...styles.masterEventPill,
                                backgroundColor: item.isApproved ? '#15803d' : '#1e3a8a',
                                cursor: canDownloadApproved || canReview ? 'pointer' : 'default',
                              }}
                            >
                              <span style={{ display: 'block', fontSize: '10px', opacity: 0.9, fontWeight: '600' }}>
                                {item.showName}
                              </span>
                              <strong style={{ fontSize: '12px' }}>
                                {item.episode_label} {item.isApproved ? '✓ ⬇' : ''}
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

        {/* Approved Episode Quick-Download Modal from Calendar */}
        {selectedApprovedModal && (() => {
          const { viewUrl, downloadUrl } = getDriveLinks(selectedApprovedModal.episode);
          const ep = selectedApprovedModal.episode;
          return (
            <div
              style={modalStyles.overlay}
              onClick={() => setSelectedApprovedModal(null)}
            >
              <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ ...styles.showIdTag, backgroundColor: '#dcfce7', color: '#166534' }}>
                    ✓ Approved Video
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedApprovedModal(null)}
                    style={{ background: '#f1f5f9', border: 'none', padding: '5px 9px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}
                  >
                    ✕
                  </button>
                </div>

                <h3 style={{ margin: '0 0 4px', fontSize: '19px', color: '#0f172a' }}>
                  {selectedApprovedModal.showName} — Ep {ep.episode_number}
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                  {ep.ep_name || `Episode ${ep.episode_number}`} · Scheduled:{' '}
                  <strong>{selectedApprovedModal.scheduleDate || ep.scheduled_date || 'N/A'}</strong>
                </p>

                {viewUrl || downloadUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...styles.driveDownloadBtn, justifyContent: 'center', padding: '11px 16px', fontSize: '14px' }}
                    >
                      ⬇ Download Video from Google Drive
                    </a>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...styles.driveViewBtn, flex: 1, justifyContent: 'center' }}
                      >
                        Open in Google Drive ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyDriveLink(viewUrl, ep.id)}
                        className="secondary-button"
                        style={{ flex: 1 }}
                      >
                        {copiedId === ep.id ? '✓ Link Copied!' : 'Copy Drive Link'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#991b1b', fontSize: '13px' }}>
                    No Google Drive link is attached to this episode yet.
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // TAB 2: SHOWS (Shared across all QCstars: Latest Shows first + Latest/Re-edited Episodes first)
  if (activeTab === 'shows') {
    const displayedShows = showsListFilter === 'active' ? activeShows : endedShows;

    return (
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '20px' }}>
        {!selectedShowForQueue ? (
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>All Shows (Latest First)</h3>
                <p>
                  Every QCstar can review episodes, edit schedules, and end or reopen any show across the team.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="primary-button"
              >
                + Create New Show
              </button>
            </div>

            {/* Active vs Ended Shows Toggle */}
            <div style={styles.subTabBar}>
              <button
                type="button"
                onClick={() => setShowsListFilter('active')}
                style={
                  showsListFilter === 'active'
                    ? styles.subTabActive
                    : styles.subTabInactive
                }
              >
                Active Shows ({activeShows.length})
              </button>
              <button
                type="button"
                onClick={() => setShowsListFilter('ended')}
                style={
                  showsListFilter === 'ended'
                    ? styles.subTabActiveRed
                    : styles.subTabInactive
                }
              >
                Ended Shows ({endedShows.length})
              </button>
            </div>

            {displayedShows.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>
                  {showsListFilter === 'active'
                    ? 'No active Shows found.'
                    : 'No ended Shows found.'}
                </strong>
                <span>
                  {showsListFilter === 'active'
                    ? 'Click "+ Create New Show" above to add a Show.'
                    : 'Shows ended by any QCstar appear here and can be reopened anytime.'}
                </span>
              </div>
            ) : (
              <div style={styles.showsListGrid}>
                {displayedShows.map((s) => {
                  const isEnded = s.status === 'ended';
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectShowForQueue(s, 'pending')}
                      style={{
                        ...styles.showCard,
                        backgroundColor: isEnded ? '#fef2f2' : '#f8fafc',
                        borderColor: isEnded ? '#fecaca' : '#e2e8f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={styles.showIdTag}>ID: {s.show_id}</span>
                        {isEnded ? (
                          <button
                            type="button"
                            disabled={reopeningId === s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReopenShow(s);
                            }}
                            style={styles.reopenShowBtn}
                          >
                            {reopeningId === s.id ? 'Reopening...' : '↻ Reopen Show'}
                          </button>
                        ) : (
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
                        )}
                      </div>

                      <h4 style={{ margin: '10px 0 4px', fontSize: '18px', color: '#0f172a' }}>
                        {s.show_name}
                      </h4>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b' }}>
                        Agency: <strong>{s.agency_name}</strong> · Creator: <strong>{s.creator_name}</strong>
                      </p>
                      {s.created_by_name && (
                        <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#64748b' }}>
                          Created by: <strong>{s.created_by_name}</strong>
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: '700' }}>
                          {isEnded ? 'View Episodes →' : 'Pending QC →'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectShowForQueue(s, 'approved');
                          }}
                          style={styles.cardApprovedPillBtn}
                        >
                          ✓ Approved Drive Links
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                <h3>{selectedShowForQueue.show_name}</h3>
                <p>
                  Most recent &amp; re-edited videos appear at the top so you never need to scroll.
                </p>
              </div>

              {selectedShowForQueue.status === 'ended' ? (
                <button
                  type="button"
                  disabled={reopeningId === selectedShowForQueue.id}
                  onClick={() => handleReopenShow(selectedShowForQueue)}
                  style={styles.driveDownloadBtn}
                >
                  {reopeningId === selectedShowForQueue.id ? 'Reopening...' : '↻ Reopen Show'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowToEnd(selectedShowForQueue)}
                  style={styles.endShowBtnLarge}
                >
                  End Show
                </button>
              )}
            </div>

            {/* Sub-Tab Switcher: Pending QC vs Approved Videos */}
            <div style={styles.subTabBar}>
              <button
                type="button"
                onClick={() => setQueueSubTab('pending')}
                style={
                  queueSubTab === 'pending'
                    ? styles.subTabActive
                    : styles.subTabInactive
                }
              >
                Pending QC ({pendingVideos.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueSubTab('approved')}
                style={
                  queueSubTab === 'approved'
                    ? styles.subTabActiveGreen
                    : styles.subTabInactive
                }
              >
                ✓ Approved Videos — Google Drive ({approvedShowVideos.length})
              </button>
            </div>

            {loadingQueue ? (
              <p style={{ color: '#64748b' }}>Loading episodes...</p>
            ) : queueSubTab === 'pending' ? (
              pendingVideos.length === 0 ? (
                <div style={styles.emptyBox}>
                  <strong>All caught up! No pending videos to QC for {selectedShowForQueue.show_name}.</strong>
                  <span>New or re-edited submissions from {selectedShowForQueue.creator_name} will appear right at the top.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pendingVideos.map((ep, index) => {
                    const isReedited = Boolean(ep.reviewed_by) && ep.status === 'Pending';
                    return (
                      <div
                        key={ep.id}
                        style={{
                          ...styles.pendingEpRow,
                          borderColor: index === 0 ? '#93c5fd' : '#e2e8f0',
                          backgroundColor: index === 0 ? '#eff6ff' : '#f8fafc',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={styles.epPill}>Ep {ep.episode_number}</span>
                            {isReedited && (
                              <span style={styles.reeditedBadge}>↻ RE-EDITED</span>
                            )}
                            {index === 0 && !isReedited && (
                              <span style={styles.latestBadge}>LATEST</span>
                            )}
                            <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                              {ep.ep_name || `Episode ${ep.episode_number}`}
                            </strong>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                            Scheduled Date: <strong>{ep.scheduled_date || 'Not set'}</strong>
                            {ep.updated_at && (
                              <>
                                {' '}
                                · Updated:{' '}
                                <strong>
                                  {new Date(ep.updated_at).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </strong>
                              </>
                            )}
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
                    );
                  })}
                </div>
              )
            ) : approvedShowVideos.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>No approved videos yet for {selectedShowForQueue.show_name}.</strong>
                <span>Once an episode is approved in QC Studio, its Google Drive download link will appear here.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {approvedShowVideos.map((ep) => {
                  const { viewUrl, downloadUrl } = getDriveLinks(ep);
                  const hasDrive = Boolean(viewUrl || downloadUrl);

                  return (
                    <div key={ep.id} style={styles.approvedEpRow}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ ...styles.epPill, backgroundColor: '#15803d' }}>
                            Ep {ep.episode_number} ✓
                          </span>
                          <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                            {ep.ep_name || `Episode ${ep.episode_number}`}
                          </strong>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                          Scheduled Date: <strong>{ep.scheduled_date || 'Not set'}</strong>
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {hasDrive ? (
                          <>
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={styles.driveDownloadBtn}
                            >
                              ⬇ Download (Google Drive)
                            </a>
                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={styles.driveViewBtn}
                            >
                              Open in Drive ↗
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopyDriveLink(viewUrl, ep.id)}
                              className="secondary-button"
                              style={{ padding: '7px 11px', fontSize: '12px' }}
                            >
                              {copiedId === ep.id ? '✓ Copied' : 'Copy Link'}
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                            No Google Drive link attached
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  Once ended, this Show will move to Ended Shows and Creator/Agency login will be closed (any QCstar can reopen it later if needed).
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
  reeditedBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: '800',
  },
  latestBadge: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    border: '1px solid #bfdbfe',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: '800',
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
  cardApprovedPillBtn: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0',
    padding: '4px 9px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  subTabBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '18px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px',
    flexWrap: 'wrap',
  },
  subTabActive: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  subTabActiveGreen: {
    backgroundColor: '#15803d',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  subTabActiveRed: {
    backgroundColor: '#b91c1c',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  subTabInactive: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
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
  reopenShowBtn: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    border: '1px solid #bbf7d0',
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
    border: '1.5px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    flexWrap: 'wrap',
    gap: '12px',
  },
  approvedEpRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1.5px solid #bbf7d0',
    backgroundColor: '#f0fdf4',
    flexWrap: 'wrap',
    gap: '12px',
  },
  driveDownloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#15803d',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    border: 'none',
    cursor: 'pointer',
  },
  driveViewBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: '#ffffff',
    color: '#1e3a8a',
    textDecoration: 'none',
    padding: '7px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    border: '1px solid #cbd5e1',
    cursor: 'pointer',
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
    maxWidth: '460px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
  },
};