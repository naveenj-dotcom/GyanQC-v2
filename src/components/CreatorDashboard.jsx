import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import ReferenceOverlay from '../ReferenceOverlay';

const DEFAULT_OVERLAY_URL = '/default-overlay.png';

export default function CreatorDashboard({ currentUser, show: initialShow }) {
  // Home view launcher: 'home' | 'calendar' | 'shows' | 'player'
  const [activeView, setActiveView] = useState('home');

  // All active shows assigned to this Show ID (POC phone number)
  const [activeShows, setActiveShows] = useState(() => {
    if (Array.isArray(currentUser?.shows) && currentUser.shows.length > 0) {
      return currentUser.shows;
    }
    return initialShow ? [initialShow] : [];
  });
  const [selectedShow, setSelectedShow] = useState(
    () => initialShow || activeShows[0] || null
  );

  // Episodes state (Active Shows & Submissions)
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [savingEp, setSavingEp] = useState(null);

  // Monthly Calendar state (Across all active shows)
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Detailed QC Feedback + Video Player Modal state
  const [selectedDetailEp, setSelectedDetailEp] = useState(null);
  const [modalDriveUrl, setModalDriveUrl] = useState('');
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [modalOverlayVisible, setModalOverlayVisible] = useState(true);
  const [modalVideoError, setModalVideoError] = useState('');
  const modalVideoRef = useRef(null);
  const modalStageRef = useRef(null);

  // Standalone Reference Player state (Tab 3: Drive link or Local file + Overlay only)
  const [playerVideoUrl, setPlayerVideoUrl] = useState('');
  const [playerVideoName, setPlayerVideoName] = useState('');
  const [playerDriveInput, setPlayerDriveInput] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [playerBuffering, setPlayerBuffering] = useState(false);
  const [playerOverlayVisible, setPlayerOverlayVisible] = useState(true);
  const playerVideoRef = useRef(null);
  const playerStageRef = useRef(null);
  const playerFileInputRef = useRef(null);

  const extractDriveId = (url) => {
    const trimmed = (url || '').trim();
    const match =
      trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Refresh all active shows assigned to this Show ID
  const refreshActiveShows = async () => {
    const showIdCode = currentUser?.show_id || initialShow?.show_id;
    if (!showIdCode) return;

    const { data, error } = await supabase
      .from('qc_shows')
      .select('*')
      .eq('show_id', showIdCode)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const ongoing = data.filter((s) => s.status !== 'ended');
      setActiveShows(ongoing);
      if (ongoing.length > 0) {
        const stillExists = ongoing.find((s) => s.id === selectedShow?.id);
        setSelectedShow(stillExists || ongoing[0]);
      } else {
        setSelectedShow(null);
      }
    }
  };

  // Load episodes for the currently selected show
  const loadEpisodes = async (targetShow = selectedShow) => {
    if (!targetShow?.id) return;
    setLoadingEpisodes(true);

    const { data, error } = await supabase
      .from('qc_episodes')
      .select('*')
      .eq('show_uuid', targetShow.id)
      .order('episode_number', { ascending: true });

    if (!error && data) {
      if (data.length === 0) {
        const initialRows = [1, 2, 3, 4, 5].map((num) => ({
          show_uuid: targetShow.id,
          episode_number: num,
          ep_name: '',
          drive_url: '',
          drive_file_id: '',
          scheduled_date: null,
          status: 'Not Submitted',
          feedback: [],
        }));

        const { data: inserted } = await supabase
          .from('qc_episodes')
          .insert(initialRows)
          .select('*')
          .order('episode_number', { ascending: true });

        if (inserted) setEpisodes(inserted);
      } else {
        setEpisodes(data);
        if (selectedDetailEp) {
          const refreshed = data.find((d) => d.id === selectedDetailEp.id);
          if (refreshed) setSelectedDetailEp(refreshed);
        }
      }
    }
    setLoadingEpisodes(false);
  };

  // Load calendar across ALL active shows for this creator/agency
  const loadCalendar = async (showsList = activeShows) => {
    const showIds = showsList.map((s) => s.id);
    if (showIds.length === 0) {
      setCalendarEntries([]);
      return;
    }

    setLoadingCalendar(true);
    const { data, error } = await supabase
      .from('qc_show_calendar')
      .select('*')
      .in('show_uuid', showIds)
      .order('schedule_date', { ascending: true });

    if (!error && data) {
      setCalendarEntries(data);
    }
    setLoadingCalendar(false);
  };

  useEffect(() => {
    refreshActiveShows();
  }, []);

  useEffect(() => {
    if (selectedShow?.id) {
      loadEpisodes(selectedShow);
    }
  }, [selectedShow?.id]);

  useEffect(() => {
    if (activeShows.length > 0) {
      loadCalendar(activeShows);
    }
  }, [activeShows]);

  // Clean up blob URLs for local videos
  useEffect(() => {
    return () => {
      if (playerVideoUrl && playerVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(playerVideoUrl);
      }
    };
  }, [playerVideoUrl]);

  const handleFieldChange = (id, field, value) => {
    setEpisodes((prev) =>
      prev.map((ep) => (ep.id === id ? { ...ep, [field]: value } : ep))
    );
  };

  const handleSaveEpisode = async (ep, overrideDriveUrl = null) => {
    const urlToUse = overrideDriveUrl !== null ? overrideDriveUrl : ep.drive_url;

    if (!ep.ep_name.trim()) {
      alert(`Please enter an Episode Name for Ep ${ep.episode_number}.`);
      return;
    }
    const fileId = extractDriveId(urlToUse);
    if (!fileId) {
      alert(`Please paste a valid Google Drive video link for Ep ${ep.episode_number}.`);
      return;
    }
    if (!ep.scheduled_date) {
      alert(`Please select a Scheduled Date for Ep ${ep.episode_number}.`);
      return;
    }

    setSavingEp(ep.id);
    const { data, error } = await supabase
      .from('qc_episodes')
      .update({
        ep_name: ep.ep_name.trim(),
        drive_url: urlToUse.trim(),
        drive_file_id: fileId,
        scheduled_date: ep.scheduled_date,
        status: 'Pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ep.id)
      .select('*')
      .single();

    setSavingEp(null);
    if (error) {
      alert('Error saving episode: ' + error.message);
    } else if (data) {
      setEpisodes((prev) => prev.map((item) => (item.id === ep.id ? data : item)));
      if (selectedDetailEp?.id === ep.id) {
        setSelectedDetailEp(null);
      }
    }
  };

  const handleAddMoreEpisode = async () => {
    if (!selectedShow?.id) return;
    const nextNumber =
      episodes.length > 0
        ? Math.max(...episodes.map((e) => e.episode_number)) + 1
        : 1;

    const { data, error } = await supabase
      .from('qc_episodes')
      .insert([
        {
          show_uuid: selectedShow.id,
          episode_number: nextNumber,
          ep_name: '',
          drive_url: '',
          drive_file_id: '',
          scheduled_date: null,
          status: 'Not Submitted',
          feedback: [],
        },
      ])
      .select('*')
      .single();

    if (!error && data) {
      setEpisodes((prev) => [...prev, data]);
    }
  };

  const openDetailsModal = (ep) => {
    setSelectedDetailEp(ep);
    setModalDriveUrl(ep.drive_url || '');
    setModalVideoError('');
    setModalOverlayVisible(true);
    setCopiedNotes(false);
  };

  // Jump QC Details Video Player directly to the clicked feedback timestamp
  const jumpModalVideoToTime = (seconds) => {
    const vid = modalVideoRef.current;
    if (!vid) return;
    vid.currentTime = seconds;
    vid.play().catch(() => {});
  };

  const handleModalFullscreen = async () => {
    const stage = modalStageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const handleCopyAllNotes = async (ep) => {
    const sorted = (ep.feedback || []).slice().sort((a, b) => a.time - b.time);
    const lines = sorted.map((f) => `[${formatTime(f.time)}] ${f.message}`).join('\n');
    const text = `QC Changes - ${selectedShow?.show_name || ''} | Ep ${ep.episode_number}: ${ep.ep_name}\nReviewer: ${ep.reviewed_by || 'QCstar'}\n\n${lines}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotes(true);
      setTimeout(() => setCopiedNotes(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Standalone Reference Player handlers (Local upload + Google Drive link)
  const handlePlayerLocalUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file.');
      return;
    }
    setPlayerError('');
    setPlayerBuffering(false);
    setPlayerVideoUrl(URL.createObjectURL(file));
    setPlayerVideoName(file.name);
    e.target.value = '';
  };

  const handlePlayerDriveLoad = (e) => {
    e.preventDefault();
    setPlayerError('');
    const fileId = extractDriveId(playerDriveInput);
    if (!fileId) {
      setPlayerError('Invalid link. Please paste a valid Google Drive video link.');
      return;
    }
    setPlayerBuffering(true);
    setPlayerVideoUrl(`/api/drive-video?id=${fileId}`);
    setPlayerVideoName(`Google Drive Video (${fileId.slice(0, 6)}...)`);
  };

  const handlePlayerFullscreen = async () => {
    const stage = playerStageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Monthly calendar grid computation
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const filteredMonthEntries = calendarEntries.filter((entry) =>
    (entry.schedule_date || '').startsWith(selectedMonth)
  );

  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push({ empty: true, key: `empty-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    const itemsForDay = filteredMonthEntries.filter((e) => e.schedule_date === dateIso);
    calendarCells.push({ empty: false, day, dateIso, items: itemsForDay, key: dateIso });
  }

  // =========================================================================
  // HOME LAUNCHER SCREEN (1. Calendar | 2. Active Shows | 3. Reference Player)
  // =========================================================================
  if (activeView === 'home') {
    return (
      <div style={{ maxWidth: '960px', margin: '44px auto', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <span style={styles.showBadge}>
            SHOW ID: {currentUser?.show_id || selectedShow?.show_id} · {activeShows.length} ACTIVE{' '}
            {activeShows.length === 1 ? 'SHOW' : 'SHOWS'}
          </span>
          <h1 style={{ margin: '12px 0 6px', fontSize: '28px', color: '#0f172a' }}>
            Welcome, {currentUser?.full_name || selectedShow?.creator_name}
          </h1>
          <p style={{ margin: 0, fontSize: '15px', color: '#64748b' }}>
            Select a workspace option below
          </p>
        </div>

        <div style={styles.homeGrid}>
          {/* 1. Calendar */}
          <button
            type="button"
            onClick={() => setActiveView('calendar')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>1</span>
            <strong style={styles.tabTitle}>Calendar</strong>
            <span style={styles.tabSub}>
              View scheduled episode dates & monthly delivery targets
            </span>
          </button>

          {/* 2. Active Shows & Submissions */}
          <button
            type="button"
            onClick={() => setActiveView('shows')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>2</span>
            <strong style={styles.tabTitle}>Active Shows</strong>
            <span style={styles.tabSub}>
              Submit episodes, check QC status & jump to feedback timestamps
            </span>
          </button>

          {/* 3. Reference Video Player */}
          <button
            type="button"
            onClick={() => setActiveView('player')}
            style={styles.homeCard}
          >
            <span style={styles.tabNumber}>3</span>
            <strong style={styles.tabTitle}>QC Reference Player</strong>
            <span style={styles.tabSub}>
              Preview Drive or local videos with the official 9:16 safe-zone overlay
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px' }}>
      {/* Top Navigation Bar when inside any tab */}
      <div style={styles.topSubNav}>
        <button
          type="button"
          onClick={() => setActiveView('home')}
          style={styles.homeBackBtn}
        >
          🏠 Home
        </button>

        <div style={styles.navPillGroup}>
          <button
            type="button"
            onClick={() => setActiveView('calendar')}
            style={activeView === 'calendar' ? styles.navPillActive : styles.navPill}
          >
            1. Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveView('shows')}
            style={activeView === 'shows' ? styles.navPillActive : styles.navPill}
          >
            2. Active Shows ({activeShows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('player')}
            style={activeView === 'player' ? styles.navPillActive : styles.navPill}
          >
            3. Reference Player
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            refreshActiveShows();
            if (selectedShow) loadEpisodes(selectedShow);
          }}
          className="secondary-button"
          style={{ padding: '7px 12px', fontSize: '13px' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ===================================================================== */}
      {/* OPTION 1: MONTHLY CALENDAR                                            */}
      {/* ===================================================================== */}
      {activeView === 'calendar' && (
        <div className="panel" style={{ marginTop: '16px' }}>
          <div className="panel-heading">
            <div>
              <h3>Monthly Show Calendar — {monthLabel}</h3>
              <p>
                Delivery schedule across your {activeShows.length} active{' '}
                {activeShows.length === 1 ? 'show' : 'shows'}.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                Select Month:
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ ...styles.input, width: '175px' }}
              />
            </div>
          </div>

          {loadingCalendar ? (
            <p style={{ color: '#64748b' }}>Loading monthly calendar...</p>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                        {cell.items.map((item) => {
                          const showObj = activeShows.find((s) => s.id === item.show_uuid);
                          return (
                            <div key={item.id} style={styles.calendarEventPill}>
                              {activeShows.length > 1 && showObj && (
                                <span style={{ display: 'block', fontSize: '9px', opacity: 0.85 }}>
                                  {showObj.show_name}
                                </span>
                              )}
                              <strong>{item.episode_label}</strong>
                              {item.notes && (
                                <span style={{ display: 'block', fontSize: '10px', opacity: 0.9 }}>
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
{/* Actionable Deliverables: Missed (Previous Days) + Today + Tomorrow */}
              {(() => {
                const now = new Date();
                const toIso = (d) =>
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
                    d.getDate()
                  ).padStart(2, '0')}`;

                const todayIso = toIso(now);
                const tmrw = new Date(now);
                tmrw.setDate(tmrw.getDate() + 1);
                const tomorrowIso = toIso(tmrw);

                const actionItems = calendarEntries
                  .filter((e) => e.schedule_date && e.schedule_date <= tomorrowIso)
                  .map((e) => ({
                    ...e,
                    tag:
                      e.schedule_date < todayIso
                        ? 'MISSED'
                        : e.schedule_date === todayIso
                        ? 'TODAY'
                        : 'TOMORROW',
                  }));

                return (
                  <div style={{ marginTop: '22px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: '#0f172a' }}>
                      Action Queue — Missed, Today & Tomorrow ({actionItems.length})
                    </h4>

                    {actionItems.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                        All caught up! Nothing missed, and no deliveries due today or tomorrow.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {actionItems.map((item) => {
                          const showObj = activeShows.find((s) => s.id === item.show_uuid);
                          const isMissed = item.tag === 'MISSED';
                          const isToday = item.tag === 'TODAY';

                          return (
                            <div
                              key={item.id}
                              style={{
                                ...styles.scheduleListRow,
                                backgroundColor: isMissed
                                  ? '#fef2f2'
                                  : isToday
                                  ? '#fffbeb'
                                  : '#f8fafc',
                                borderColor: isMissed
                                  ? '#fca5a5'
                                  : isToday
                                  ? '#fcd34d'
                                  : '#e2e8f0',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <span
                                  style={{
                                    ...styles.dateTag,
                                    backgroundColor: isMissed
                                      ? '#dc2626'
                                      : isToday
                                      ? '#d97706'
                                      : '#1e3a8a',
                                    color: '#ffffff',
                                  }}
                                >
                                  {item.tag} · {item.schedule_date}
                                </span>
                                {showObj && (
                                  <span style={styles.showInlineBadge}>{showObj.show_name}</span>
                                )}
                                <strong style={{ marginLeft: '4px', color: '#0f172a' }}>
                                  {item.episode_label}
                                </strong>
                                {item.notes && (
                                  <span style={{ fontSize: '13px', color: '#475569' }}>
                                    — {item.notes}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (showObj) setSelectedShow(showObj);
                                  setActiveView('shows');
                                }}
                                className="secondary-button"
                                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700' }}
                              >
                                Go to Submit →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* OPTION 2: ACTIVE SHOWS & EPISODE SUBMISSIONS                          */}
      {/* ===================================================================== */}
      {activeView === 'shows' && (
        <div style={{ marginTop: '16px' }}>
          {/* Active Shows Switcher Cards (if creator has 1 or multiple shows) */}
          <div className="panel" style={{ marginBottom: '16px' }}>
            <div className="panel-heading" style={{ marginBottom: '12px' }}>
              <div>
                <h3>Your Active Shows ({activeShows.length})</h3>
                <p>Select a Show to submit episodes or inspect QC feedback.</p>
              </div>
            </div>

            <div style={styles.showsSwitcherGrid}>
              {activeShows.map((s) => {
                const isSelected = selectedShow?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedShow(s)}
                    style={{
                      ...styles.showSwitchCard,
                      border: isSelected ? '2px solid #1e3a8a' : '1.5px solid #e2e8f0',
                      backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={styles.showBadge}>ID: {s.show_id}</span>
                      {isSelected && (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e3a8a' }}>
                          ● Active Workspace
                        </span>
                      )}
                    </div>
                    <strong style={{ display: 'block', fontSize: '16px', color: '#0f172a', marginTop: '8px' }}>
                      {s.show_name}
                    </strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      Agency: {s.agency_name} · QCstar: {s.created_by_name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Episode Submissions List for Selected Show */}
          {selectedShow && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>{selectedShow.show_name} — Episode Submissions</h3>
                  <p>
                    Fill Episode Name, Google Drive link ("Anyone with the link"), and Scheduled Date.
                  </p>
                </div>
              </div>

              {loadingEpisodes ? (
                <p style={{ color: '#64748b' }}>Loading episode slots...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {episodes.map((ep) => {
                    const isApproved = ep.status === 'Approved';
                    const isChanges = ep.status === 'Changes Requested';
                    const feedbackCount = Array.isArray(ep.feedback) ? ep.feedback.length : 0;

                    return (
                      <div
                        key={ep.id}
                        style={{
                          ...styles.epCard,
                          border: isApproved
                            ? '1.5px solid #86efac'
                            : isChanges
                            ? '1.5px solid #fca5a5'
                            : '1px solid #e2e8f0',
                          backgroundColor: isApproved
                            ? '#f0fdf4'
                            : isChanges
                            ? '#fef2f2'
                            : '#f8fafc',
                        }}
                      >
                        <div style={styles.epTopRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={styles.epNumberBadge}>Ep {ep.episode_number}</span>
                            {isApproved && (
                              <span style={styles.approvedCheckPill}>✓ Approved by QCstar</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {ep.reviewed_by && (
                              <span style={{ fontSize: '12px', color: '#64748b' }}>
                                Reviewed by <strong>{ep.reviewed_by}</strong>
                              </span>
                            )}

                            {(isChanges || feedbackCount > 0 || ep.drive_file_id) && (
                              <button
                                type="button"
                                onClick={() => openDetailsModal(ep)}
                                style={
                                  isChanges || feedbackCount > 0
                                    ? styles.detailViewBtn
                                    : styles.previewDetailBtn
                                }
                              >
                                {isChanges || feedbackCount > 0
                                  ? `View QC Details & Player (${feedbackCount})`
                                  : 'Preview with Overlay'}
                              </button>
                            )}

                            <span
                              className={`review-status ${ep.status.toLowerCase().replace(' ', '-')}`}
                              style={
                                ep.status === 'Not Submitted'
                                  ? { backgroundColor: '#e2e8f0', color: '#475569' }
                                  : isApproved
                                  ? { backgroundColor: '#16a34a', color: '#ffffff', fontWeight: '700' }
                                  : undefined
                              }
                            >
                              {isApproved ? '✓ Approved' : ep.status}
                            </span>
                          </div>
                        </div>

                        <div style={styles.fieldsGrid}>
                          <div>
                            <label style={styles.label}>Episode Name</label>
                            <input
                              type="text"
                              placeholder={`e.g. Episode ${ep.episode_number} - Title`}
                              value={ep.ep_name || ''}
                              onChange={(e) => handleFieldChange(ep.id, 'ep_name', e.target.value)}
                              style={styles.input}
                            />
                          </div>

                          <div>
                            <label style={styles.label}>Google Drive Video Link</label>
                            <input
                              type="url"
                              placeholder="https://drive.google.com/file/d/..."
                              value={ep.drive_url || ''}
                              onChange={(e) => handleFieldChange(ep.id, 'drive_url', e.target.value)}
                              style={styles.input}
                            />
                          </div>

                          <div>
                            <label style={styles.label}>Scheduled Date</label>
                            <input
                              type="date"
                              value={ep.scheduled_date || ''}
                              onChange={(e) =>
                                handleFieldChange(ep.id, 'scheduled_date', e.target.value)
                              }
                              style={styles.input}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                              type="button"
                              disabled={savingEp === ep.id}
                              onClick={() => handleSaveEpisode(ep)}
                              className="primary-button"
                              style={{ width: '100%', height: '40px' }}
                            >
                              {savingEp === ep.id
                                ? 'Submitting...'
                                : ep.status === 'Not Submitted'
                                ? 'Submit for QC'
                                : 'Update & Resubmit'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddMoreEpisode}
                    style={styles.addMoreBtn}
                  >
                    + Add Episode details
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* OPTION 3: STANDALONE QC REFERENCE PLAYER (NO FEEDBACK SECTION)        */}
      {/* ===================================================================== */}
      {activeView === 'player' && (
        <div style={{ maxWidth: '880px', margin: '16px auto 0' }}>
          <div className="panel video-panel">
            <div className="panel-heading">
              <div>
                <h3>QC Reference Video Player</h3>
                <p>
                  Preview Google Drive links or local video files with the official 9:16 safe-zone overlay.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPlayerOverlayVisible((v) => !v)}
                  className="secondary-button"
                  style={{ fontWeight: '600' }}
                >
                  {playerOverlayVisible ? 'Hide Overlay' : 'Show Overlay'}
                </button>
                {playerVideoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerVideoUrl('');
                      setPlayerVideoName('');
                      setPlayerDriveInput('');
                      setPlayerError('');
                    }}
                    className="secondary-button"
                  >
                    Change Video
                  </button>
                )}
              </div>
            </div>

            <input
              ref={playerFileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={handlePlayerLocalUpload}
            />

            <div ref={playerStageRef} className="video-stage">
              {playerVideoUrl ? (
                <>
                  <video
                    ref={playerVideoRef}
                    className="review-video"
                    src={playerVideoUrl}
                    preload="auto"
                    controls
                    playsInline
                    controlsList="nofullscreen noremoteplayback"
                    disablePictureInPicture
                    style={{
                      transform: 'translateZ(0)',
                      willChange: 'transform',
                    }}
                    onWaiting={() => setPlayerBuffering(true)}
                    onCanPlay={() => setPlayerBuffering(false)}
                    onPlaying={() => setPlayerBuffering(false)}
                    onError={() => {
                      setPlayerBuffering(false);
                      if (playerVideoUrl.startsWith('/api/drive-video')) {
                        setPlayerError(
                          "Could not stream video. Make sure the Google Drive file is shared as 'Anyone with the link'."
                        );
                      }
                    }}
                  />

                  <div style={{ pointerEvents: 'none' }}>
                    <ReferenceOverlay
                      src={DEFAULT_OVERLAY_URL}
                      visible={playerOverlayVisible}
                      tolerance={100}
                      opacity={80}
                      size={100}
                      horizontal={50}
                      vertical={50}
                    />
                  </div>

                  <button
                    className="fullscreen-button"
                    type="button"
                    onClick={handlePlayerFullscreen}
                    title="Fullscreen"
                    aria-label="Enter fullscreen"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="video-upload-placeholder">
                  <button
                    className="upload-trigger-area"
                    onClick={() => playerFileInputRef.current?.click()}
                    type="button"
                  >
                    <span className="upload-icon">▶</span>
                    <strong>Upload Local Video</strong>
                    <span>Check safe zones & framing before uploading to Drive</span>
                    <span className="upload-format">MP4, MOV, WEBM</span>
                  </button>

                  <form className="drive-link-form" onSubmit={handlePlayerDriveLoad}>
                    <span className="drive-divider">OR PASTE GOOGLE DRIVE LINK</span>
                    <div className="drive-input-group">
                      <input
                        type="url"
                        placeholder="https://drive.google.com/file/d/..."
                        value={playerDriveInput}
                        onChange={(e) => setPlayerDriveInput(e.target.value)}
                        required
                      />
                      <button type="submit">Load</button>
                    </div>
                    {playerError && <span className="drive-error">{playerError}</span>}
                  </form>
                </div>
              )}
            </div>

            {playerError && playerVideoUrl && (
              <p style={{ color: '#dc2626', fontSize: '13px', margin: '10px 0 0' }}>
                {playerError}
              </p>
            )}

            <div className="video-information">
              <div>
                <strong>{playerVideoName || 'No video loaded'}</strong>
                <span>
                  {playerVideoUrl
                    ? playerBuffering
                      ? 'Buffering video stream...'
                      : 'Default 9:16 QCstar reference overlay active'
                    : 'Upload a local video or paste a Drive link above'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* QC DETAILS MODAL WITH INTEGRATED PLAYER + CLICKABLE TIMESTAMPS        */}
      {/* ===================================================================== */}
      {selectedDetailEp && (
        <div style={modalStyles.overlay} onClick={() => setSelectedDetailEp(null)}>
          <div style={modalStyles.wideCard} onClick={(e) => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={styles.epNumberBadge}>Ep {selectedDetailEp.episode_number}</span>
                  <span
                    className={`review-status ${selectedDetailEp.status
                      .toLowerCase()
                      .replace(' ', '-')}`}
                  >
                    {selectedDetailEp.status === 'Approved'
                      ? '✓ Approved'
                      : selectedDetailEp.status}
                  </span>
                </div>
                <h3 style={{ margin: '4px 0 0', fontSize: '18px', color: '#0f172a' }}>
                  {selectedDetailEp.ep_name || `Episode ${selectedDetailEp.episode_number}`}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Scheduled: <strong>{selectedDetailEp.scheduled_date || 'Not set'}</strong> · Reviewed by:{' '}
                  <strong>{selectedDetailEp.reviewed_by || 'QCstar'}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalOverlayVisible((v) => !v)}
                  className="secondary-button"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                >
                  {modalOverlayVisible ? 'Hide Overlay' : 'Show Overlay'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDetailEp(null)}
                  style={modalStyles.closeBtn}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Split Layout: Left = Video Player with Overlay | Right = Clickable Timestamp Notes */}
            <div style={modalStyles.splitBody}>
              {/* Left Column: Video Player */}
              <div>
                <div ref={modalStageRef} className="video-stage" style={{ minHeight: '340px' }}>
                  {selectedDetailEp.drive_file_id ? (
                    <>
                      <video
                        ref={modalVideoRef}
                        className="review-video"
                        src={`/api/drive-video?id=${selectedDetailEp.drive_file_id}`}
                        preload="auto"
                        controls
                        playsInline
                        controlsList="nofullscreen noremoteplayback"
                        disablePictureInPicture
                        style={{
                          transform: 'translateZ(0)',
                          willChange: 'transform',
                        }}
                        onError={() =>
                          setModalVideoError(
                            "Could not stream video. Make sure the Google Drive file is shared as 'Anyone with the link'."
                          )
                        }
                      />

                      <div style={{ pointerEvents: 'none' }}>
                        <ReferenceOverlay
                          src={DEFAULT_OVERLAY_URL}
                          visible={modalOverlayVisible}
                          tolerance={100}
                          opacity={80}
                          size={100}
                          horizontal={50}
                          vertical={50}
                        />
                      </div>

                      <button
                        className="fullscreen-button"
                        type="button"
                        onClick={handleModalFullscreen}
                        title="Fullscreen"
                        aria-label="Enter fullscreen"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div style={{ color: '#cbd5e1', padding: '24px', textAlign: 'center' }}>
                      No video file linked for this episode yet.
                    </div>
                  )}
                </div>
                {modalVideoError && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>
                    {modalVideoError}
                  </p>
                )}
              </div>

              {/* Right Column: Clickable Timestamp Feedback + Resubmit */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={modalStyles.notesSection}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>
                        QCstar Feedback ({(selectedDetailEp.feedback || []).length})
                      </strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Click any timestamp badge to jump the video to that exact second
                      </span>
                    </div>
                    {(selectedDetailEp.feedback || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleCopyAllNotes(selectedDetailEp)}
                        style={modalStyles.copyBtn}
                      >
                        {copiedNotes ? '✓ Copied!' : 'Copy All'}
                      </button>
                    )}
                  </div>

                  {!selectedDetailEp.feedback || selectedDetailEp.feedback.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      No timestamped notes were attached.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '260px',
                        overflowY: 'auto',
                      }}
                    >
                      {selectedDetailEp.feedback
                        .slice()
                        .sort((a, b) => a.time - b.time)
                        .map((item, idx) => (
                          <div key={item.id || idx} style={modalStyles.noteCard}>
                            <button
                              type="button"
                              onClick={() => jumpModalVideoToTime(item.time)}
                              title="Jump video to this timestamp"
                              style={modalStyles.timeJumpBtn}
                            >
                              ▶ {formatTime(item.time)}
                            </button>
                            <p
                              style={{
                                margin: 0,
                                fontSize: '13px',
                                color: '#1e293b',
                                lineHeight: 1.45,
                              }}
                            >
                              {item.message}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div style={modalStyles.resubmitBox}>
                  <label style={{ ...styles.label, color: '#0f172a' }}>
                    Submit Revised Google Drive Link (after fixing changes)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/file/d/..."
                      value={modalDriveUrl}
                      onChange={(e) => setModalDriveUrl(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                    />
                    <button
                      type="button"
                      disabled={savingEp === selectedDetailEp.id}
                      onClick={() => handleSaveEpisode(selectedDetailEp, modalDriveUrl)}
                      className="primary-button"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {savingEp === selectedDetailEp.id ? 'Submitting...' : 'Submit Revised Cut'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  homeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
  },
  homeCard: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    borderRadius: '16px',
    padding: '34px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '10px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
    transition: 'all 0.15s ease',
  },
  tabNumber: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '19px',
    fontWeight: '800',
  },
  tabTitle: {
    fontSize: '20px',
    color: '#0f172a',
    fontWeight: '700',
  },
  tabSub: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: 1.4,
  },
  topSubNav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    backgroundColor: '#ffffff',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  homeBackBtn: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  navPillGroup: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  navPill: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  navPillActive: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #1e3a8a',
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  showsSwitcherGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
  },
  showSwitchCard: {
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  showBadge: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
  },
  showInlineBadge: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '6px',
    marginLeft: '8px',
  },
  weekHeaderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
    marginBottom: '6px',
  },
  weekDayHeader: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '700',
    color: '#64748b',
    padding: '6px 0',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
  },
  emptyCalendarCell: {
    minHeight: '86px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
  },
calendarCell: {
    minHeight: '115px',
    height: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: '4px',
  },
  dayNumber: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#334155',
  },
  calendarEventPill: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    fontSize: '11px',
    padding: '4px 6px',
    borderRadius: '5px',
    lineHeight: 1.25,
  },
  scheduleListRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  dateTag: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: '12px',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  epCard: {
    borderRadius: '10px',
    padding: '16px',
    transition: 'all 0.2s ease',
  },
  epTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  epNumberBadge: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '700',
  },
  approvedCheckPill: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    border: '1px solid #86efac',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
  },
  detailViewBtn: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  previewDetailBtn: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    border: 'none',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  fieldsGrid: {
    display: 'grid',
    gridTemplateColumns: '1.3fr 1.8fr 1fr 150px',
    gap: '12px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    height: '40px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
  },
  addMoreBtn: {
    padding: '14px',
    borderRadius: '10px',
    border: '2px dashed #94a3b8',
    backgroundColor: '#f8fafc',
    color: '#1e3a8a',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};

const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  wideCard: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '960px',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    paddingBottom: '14px',
    borderBottom: '1px solid #e2e8f0',
  },
  splitBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '20px',
    marginTop: '16px',
  },
  closeBtn: {
    background: '#f1f5f9',
    border: 'none',
    padding: '7px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    color: '#334155',
  },
  notesSection: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '14px',
  },
  copyBtn: {
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    border: '1px solid #bfdbfe',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  noteCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    backgroundColor: '#ffffff',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  timeJumpBtn: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    border: 'none',
    fontWeight: '700',
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: '6px',
    flexShrink: 0,
    cursor: 'pointer',
  },
  resubmitBox: {
    marginTop: '14px',
    paddingTop: '14px',
    borderTop: '1px solid #e2e8f0',
  },
};