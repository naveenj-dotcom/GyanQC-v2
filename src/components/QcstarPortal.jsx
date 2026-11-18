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

// Generate a clean unique Creator ID like CR-4829
function generateCreatorCode() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `CR-${randomNum}`;
}

export default function QcstarPortal({
  activeTab,
  isCreatorsView,
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

  // Creators Directory View & List state
  const [creatorsList, setCreatorsList] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [creatorSearch, setCreatorSearch] = useState('');
  const [copiedTableCreatorId, setCopiedTableCreatorId] = useState(null);

  // Create New Creator Modal state
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newCreatorEmail, setNewCreatorEmail] = useState('');
  const [creatingCreator, setCreatingCreator] = useState(false);
  const [generatedCreator, setGeneratedCreator] = useState(null);
  const [copiedCreatorId, setCopiedCreatorId] = useState(false);

  // Create New Show Popup state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [newShowDescription, setNewShowDescription] = useState('');
  const [linkCreatorId, setLinkCreatorId] = useState('');
  const [creatingShow, setCreatingShow] = useState(false);

  // Latest created show always appears at the top
  const sortedShows = [...shows].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA;
  });

  const activeShows = sortedShows.filter((s) => s.status !== 'ended');
  const endedShows = sortedShows.filter((s) => s.status === 'ended');

  const fetchCreators = async () => {
    setLoadingCreators(true);
    const { data } = await supabase
      .from('qc_creators')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCreatorsList(data);
    setLoadingCreators(false);
  };

  useEffect(() => {
    if (activeTab === 'shows') {
      fetchCreators();
    } else {
      setSelectedShowForQueue(null);
    }
  }, [activeTab]);

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

  // Create New Creator & Generate Unique Creator ID
  const handleCreateCreatorSubmit = async (e) => {
    e.preventDefault();
    const cleanName = newCreatorName.trim();
    const cleanEmail = newCreatorEmail.trim().toLowerCase();
    if (!cleanName || !cleanEmail) return;

    setCreatingCreator(true);

    // Check if creator email already exists
    const { data: existingCreator } = await supabase
      .from('qc_creators')
      .select('*')
      .eq('creator_email', cleanEmail)
      .maybeSingle();

    if (existingCreator) {
      setCreatingCreator(false);
      setGeneratedCreator(existingCreator);
      await fetchCreators();
      return;
    }

    // Generate a unique Creator ID (retry if collision)
    let createdRecord = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId = generateCreatorCode();
      const { data, error } = await supabase
        .from('qc_creators')
        .insert([
          {
            creator_id: candidateId,
            creator_name: cleanName,
            creator_email: cleanEmail,
            created_by_email: currentUser.email,
            created_by_name: currentUser.full_name,
          },
        ])
        .select('*')
        .single();

      if (!error && data) {
        createdRecord = data;
        break;
      }
      if (error && !error.message.toLowerCase().includes('creator_id')) {
        alert('Error creating Creator: ' + error.message);
        setCreatingCreator(false);
        return;
      }
    }

    setCreatingCreator(false);
    if (createdRecord) {
      setGeneratedCreator(createdRecord);
      setNewCreatorName('');
      setNewCreatorEmail('');
      await fetchCreators();
    }
  };

  // Live match of entered Creator ID inside Create Show modal
  const matchedCreator = creatorsList.find(
    (c) => c.creator_id.toUpperCase() === linkCreatorId.trim().toUpperCase()
  );

  // Create New Show connected to Creator ID
  const handleCreateShowSubmit = async (e) => {
    e.preventDefault();

    if (!matchedCreator) {
      alert('Invalid Creator ID. Please enter a valid Creator ID or create a Creator first.');
      return;
    }

    setCreatingShow(true);

    const { data: createdShow, error } = await supabase
      .from('qc_shows')
      .insert([
        {
          show_name: newShowName.trim(),
          description: newShowDescription.trim(),
          creator_id: matchedCreator.creator_id,
          creator_name: matchedCreator.creator_name,
          creator_email: matchedCreator.creator_email,
          agency_name: matchedCreator.creator_name,
          show_id: matchedCreator.creator_id,
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
    setNewShowDescription('');
    setLinkCreatorId('');
    setShowCreateModal(false);
    onNavigate('shows');
    alert(
      `Show "${createdShow.show_name}" created and linked to ${matchedCreator.creator_name} (${matchedCreator.creator_id})!`
    );
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

  // TAB 2: SHOWS & CREATORS DIRECTORY
  if (activeTab === 'shows') {
    const displayedShows = showsListFilter === 'active' ? activeShows : endedShows;
    const filteredCreators = creatorsList.filter((c) => {
      const q = creatorSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        (c.creator_name || '').toLowerCase().includes(q) ||
        (c.creator_email || '').toLowerCase().includes(q) ||
        (c.creator_id || '').toLowerCase().includes(q)
      );
    });

    return (
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '20px' }}>
        {isCreatorsView ? (
          /* CREATORS DIRECTORY PAGE */
          <div className="panel">
            <div className="panel-heading">
              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('shows')}
                  className="secondary-button"
                  style={{ marginBottom: '10px', padding: '5px 10px', fontSize: '12px' }}
                >
                  ← Back to All Shows
                </button>
                <h3>Creators Directory ({creatorsList.length})</h3>
                <p>
                  All registered Creators, their Login Email, and unique Creator IDs for linking Shows.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setGeneratedCreator(null);
                  setNewCreatorName('');
                  setNewCreatorEmail('');
                  setCreatorModalOpen(true);
                }}
                className="primary-button"
              >
                + Create New Creator
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search by Creator Name, Email, or Creator ID (e.g. CR-9531)..."
                value={creatorSearch}
                onChange={(e) => setCreatorSearch(e.target.value)}
                style={{ ...styles.input, maxWidth: '420px' }}
              />
            </div>

            {loadingCreators ? (
              <p style={{ color: '#64748b' }}>Loading creators...</p>
            ) : filteredCreators.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>
                  {creatorsList.length === 0
                    ? 'No Creators added yet.'
                    : 'No matching Creators found.'}
                </strong>
                <span>
                  Click <strong>+ Create New Creator</strong> above to generate a Creator ID.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Creator Name</th>
                      <th style={styles.th}>Email (Login)</th>
                      <th style={styles.th}>Creator ID</th>
                      <th style={styles.th}>Linked Shows</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCreators.map((c) => {
                      const linkedCount = sortedShows.filter(
                        (s) =>
                          (s.creator_id || '').toUpperCase() ===
                            (c.creator_id || '').toUpperCase() ||
                          (s.creator_email || '').toLowerCase() ===
                            (c.creator_email || '').toLowerCase()
                      ).length;

                      return (
                        <tr key={c.id} style={styles.tr}>
                          <td style={styles.td}>
                            <strong>{c.creator_name}</strong>
                          </td>
                          <td style={styles.td}>{c.creator_email}</td>
                          <td style={styles.td}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <code style={styles.creatorCodeBadge}>{c.creator_id}</code>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(c.creator_id);
                                  setCopiedTableCreatorId(c.id);
                                  setTimeout(() => setCopiedTableCreatorId(null), 2000);
                                }}
                                className="secondary-button"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                {copiedTableCreatorId === c.id ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </td>
                          <td style={styles.td}>
                            {linkedCount} {linkedCount === 1 ? 'Show' : 'Shows'}
                          </td>
                          <td style={styles.td}>
                            <button
                              type="button"
                              onClick={() => {
                                setLinkCreatorId(c.creator_id);
                                setShowCreateModal(true);
                              }}
                              className="secondary-button"
                              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '700' }}
                            >
                              + Create Show
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
        ) : !selectedShowForQueue ? (
          /* ALL SHOWS PAGE */
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>All Shows (Latest First)</h3>
                <p>
                  Manage Creators &amp; Creator IDs, or create a Show and link it using a Creator ID.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    fetchCreators();
                    setCreatorSearch('');
                    onNavigate('creators');
                  }}
                  className="secondary-button"
                  style={{ fontWeight: '700', borderColor: '#1e3a8a', color: '#1e3a8a' }}
                >
                  Creators ({creatorsList.length})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fetchCreators();
                    setShowCreateModal(true);
                  }}
                  className="primary-button"
                >
                  + Create New Show
                </button>
              </div>
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
                    ? 'Click "Creators" to get a Creator ID, then click "+ Create New Show".'
                    : 'Shows ended by any QCstar appear here and can be reopened anytime.'}
                </span>
              </div>
            ) : (
              <div style={styles.showsListGrid}>
                {displayedShows.map((s) => {
                  const isEnded = s.status === 'ended';
                  const displayCreatorId = s.creator_id || s.show_id;
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
                        <span style={styles.showIdTag}>Creator ID: {displayCreatorId}</span>
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
                      {s.description && (
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                          {s.description}
                        </p>
                      )}
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b' }}>
                        Creator: <strong>{s.creator_name}</strong>
                        {s.creator_email ? ` (${s.creator_email})` : ''}
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
          /* SHOW QUEUE DRILLDOWN (PENDING QC & APPROVED DRIVE LINKS) */
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
                Are you sure you want to end <strong>{showToEnd.show_name}</strong>?
                <br />
                <span style={{ fontSize: '13px', color: '#991b1b' }}>
                  Once ended, this Show will move to Ended Shows and will no longer appear in the Creator's active dashboard (any QCstar can reopen it later if needed).
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

        {/* MODAL: Create New Creator & Generate Creator ID */}
        {creatorModalOpen && (
          <div style={modalStyles.overlay} onClick={() => !creatingCreator && setCreatorModalOpen(false)}>
            <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>Create New Creator</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Generates a unique Creator ID to connect one or multiple Shows.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={creatingCreator}
                  onClick={() => setCreatorModalOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  ✕
                </button>
              </div>

              {!generatedCreator ? (
                <form onSubmit={handleCreateCreatorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    <label style={styles.label}>Creator Email (used for Login) *</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. vikram@studio.com"
                      value={newCreatorEmail}
                      onChange={(e) => setNewCreatorEmail(e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <button type="submit" disabled={creatingCreator} className="primary-button" style={{ marginTop: '6px' }}>
                    {creatingCreator ? 'Generating Creator ID...' : 'Create Creator & Generate ID'}
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1.5px solid #86efac' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#166534' }}>
                      ✓ CREATOR READY
                    </span>
                    <h4 style={{ margin: '6px 0 2px', fontSize: '17px', color: '#0f172a' }}>
                      {generatedCreator.creator_name}
                    </h4>
                    <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569' }}>
                      Login Email: <strong>{generatedCreator.creator_email}</strong>
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Creator ID</span>
                        <strong style={{ fontSize: '18px', color: '#1e3a8a', letterSpacing: '0.5px' }}>
                          {generatedCreator.creator_id}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(generatedCreator.creator_id);
                          setCopiedCreatorId(true);
                          setTimeout(() => setCopiedCreatorId(false), 2000);
                        }}
                        className="secondary-button"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        {copiedCreatorId ? '✓ Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const idToUse = generatedCreator.creator_id;
                      setCreatorModalOpen(false);
                      setLinkCreatorId(idToUse);
                      setShowCreateModal(true);
                    }}
                    className="primary-button"
                  >
                    + Create Show for {generatedCreator.creator_name} →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: Create New Show & Connect via Creator ID */}
        {showCreateModal && (
          <div style={modalStyles.overlay} onClick={() => !creatingShow && setShowCreateModal(false)}>
            <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>Create New Show</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Connect this Show to a Creator using their Creator ID.
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
                  <label style={styles.label}>Description</label>
                  <textarea
                    rows="2"
                    placeholder="Brief description of the show, format, or genre..."
                    value={newShowDescription}
                    onChange={(e) => setNewShowDescription(e.target.value)}
                    style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label style={styles.label}>Creator ID (to connect Show to Creator) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CR-4821"
                    value={linkCreatorId}
                    onChange={(e) => setLinkCreatorId(e.target.value)}
                    style={styles.input}
                  />

                  {linkCreatorId.trim() && (
                    <div
                      style={{
                        marginTop: '6px',
                        padding: '8px 10px',
                        borderRadius: '7px',
                        fontSize: '12px',
                        backgroundColor: matchedCreator ? '#dcfce7' : '#fee2e2',
                        color: matchedCreator ? '#166534' : '#991b1b',
                      }}
                    >
                      {matchedCreator ? (
                        <>
                          ✓ Connected to: <strong>{matchedCreator.creator_name}</strong> ({matchedCreator.creator_email})
                        </>
                      ) : (
                        <>
                          ✕ Creator ID not found. Check the ID or{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateModal(false);
                              setGeneratedCreator(null);
                              setCreatorModalOpen(true);
                            }}
                            style={{ background: 'none', border: 'none', color: '#1e3a8a', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                          >
                            create a new Creator first
                          </button>
                          .
                        </>
                      )}
                    </div>
                  )}

                  {creatorsList.length > 0 && !matchedCreator && (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                        Quick select existing Creator:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '85px', overflowY: 'auto' }}>
                        {creatorsList.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setLinkCreatorId(c.creator_id)}
                            style={{
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              color: '#0f172a',
                            }}
                          >
                            <strong>{c.creator_id}</strong> · {c.creator_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={creatingShow || !matchedCreator}
                  className="primary-button"
                  style={{ marginTop: '6px', opacity: !matchedCreator ? 0.6 : 1 }}
                >
                  {creatingShow ? 'Creating Show...' : 'Create Show & Connect to Creator'}
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid #e2e8f0',
    color: '#475569',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '12px',
    color: '#0f172a',
  },
  creatorCodeBadge: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    padding: '4px 10px',
    borderRadius: '6px',
    fontWeight: '800',
    fontSize: '13px',
    letterSpacing: '0.4px',
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
    justifyContent: "center",
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