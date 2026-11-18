import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import ReferenceOverlay from '../ReferenceOverlay';
import CreatorNotificationBell from './CreatorNotificationBell';
import CreatorMonthlyReport from './CreatorMonthlyReport';
import ShowSearchSelect from './ShowSearchSelect';

const VIDEO_PROXY_URL = 'https://gyanqc-video-proxy.naveenj.workers.dev';

function extractGoogleDriveId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const match =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function getCreatorStatusBadge(ep) {
  if (!ep || ep.status === 'Not Submitted') {
    return {
      label: 'Not Submitted',
      bg: '#f1f5f9',
      color: '#475569',
      border: '1px solid #cbd5e1',
    };
  }
  if (ep.status === 'Approved') {
    return {
      label: '✓ Approved',
      bg: '#dcfce7',
      color: '#166534',
      border: '1px solid #86efac',
    };
  }
  if (ep.status === 'Changes Requested') {
    return {
      label: '⚠ Changes Requested',
      bg: '#fee2e2',
      color: '#b91c1c',
      border: '1px solid #fca5a5',
    };
  }
  return {
    label: '⏳ Pending QC',
    bg: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
  };
}

export default function CreatorDashboard({ currentUser, show, overlayUrl }) {
  const creatorId =
    currentUser?.show_id || show?.creator_id || show?.show_id || '';
  const creatorEmail = (currentUser?.email || '').toLowerCase();

  const [showsList, setShowsList] = useState(show ? [show] : []);
  const [selectedShow, setSelectedShow] = useState(show || null);
  const [loadingShows, setLoadingShows] = useState(true);

  // 4 bottom tabs: 'home' | 'shows' | 'calendar' | 'reports'
  const [activeTab, setActiveTab] = useState('home');
  // Inside 'shows' tab: 'list' (all shows latest first) or 'detail' (selected show episodes descending)
  const [showsViewMode, setShowsViewMode] = useState('list');

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [calendarEntries, setCalendarEntries] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [modalEpNumber, setModalEpNumber] = useState('');
  const [modalEpName, setModalEpName] = useState('');
  const [modalDriveUrl, setModalDriveUrl] = useState('');
  const [modalScheduledDate, setModalScheduledDate] = useState('');
  const [isNewEpisodeUpload, setIsNewEpisodeUpload] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [previewEp, setPreviewEp] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [previewMode, setPreviewMode] = useState('adaptive'); // 'adaptive' | 'direct'
  const [previewError, setPreviewError] = useState('');
  const videoRef = useRef(null);

  const fetchAssignedShows = async () => {
    setLoadingShows(true);
    let query = supabase
      .from('qc_shows')
      .select('*')
      .order('created_at', { ascending: false });

    if (creatorId) {
      query = query.or(
        `creator_id.ilike.${creatorId},show_id.ilike.${creatorId},creator_email.eq.${creatorEmail}`
      );
    } else if (creatorEmail) {
      query = query.eq('creator_email', creatorEmail);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      const visibleShows = data
        .filter((s) => s.status !== 'ended')
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        );
      setShowsList(visibleShows);
      setSelectedShow((prev) => {
        if (prev && visibleShows.some((s) => s.id === prev.id)) return prev;
        return visibleShows[0] || null;
      });
    }
    setLoadingShows(false);
  };

  useEffect(() => {
    fetchAssignedShows();
  }, [creatorId, creatorEmail]);

  const fetchShowDetails = async (showUuid) => {
    if (!showUuid) return;
    setLoadingData(true);

    const [{ data: calData }, { data: epData }] = await Promise.all([
      supabase
        .from('qc_show_calendar')
        .select('*')
        .eq('show_uuid', showUuid)
        .order('schedule_date', { ascending: true }),
      supabase
        .from('qc_episodes')
        .select('*')
        .eq('show_uuid', showUuid)
        .order('episode_number', { ascending: false }),
    ]);

    setCalendarEntries(calData || []);
    const sortedEps = (epData || [])
      .slice()
      .sort((a, b) => Number(b.episode_number || 0) - Number(a.episode_number || 0));
    setEpisodes(sortedEps);
    setLoadingData(false);
  };

  useEffect(() => {
    if (selectedShow?.id) {
      fetchShowDetails(selectedShow.id);
    }
  }, [selectedShow]);

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const shiftMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    );
  };

  // Compute next auto episode number = highest submitted episode number + 1
  const getNextEpisodeNumber = () => {
    const validNumbers = episodes
      .filter((ep) => ep.status !== 'Not Submitted' || Boolean(ep.drive_file_id))
      .map((ep) => Number(ep.episode_number || 0))
      .filter((n) => n > 0);
    if (validNumbers.length === 0) return 1;
    return Math.max(...validNumbers) + 1;
  };

  const openModalForEpisode = ({
    epNumber = null,
    epName = '',
    driveUrl = '',
    scheduledDate = '',
  } = {}) => {
    const isNew = !epNumber;
    const resolvedNumber = isNew ? getNextEpisodeNumber() : Number(epNumber);
    setIsNewEpisodeUpload(isNew);
    setModalEpNumber(String(resolvedNumber));
    setModalEpName(epName || '');
    setModalDriveUrl(driveUrl || '');
    setModalScheduledDate(scheduledDate || '');
    setUploadModalOpen(true);
  };

  const handleOpenNotificationEpisode = async (targetShowUuid, episodeNumber) => {
    let targetShow = showsList.find((s) => s.id === targetShowUuid);
    if (!targetShow) {
      const { data: fetchedShow } = await supabase
        .from('qc_shows')
        .select('*')
        .eq('id', targetShowUuid)
        .maybeSingle();
      if (fetchedShow) {
        targetShow = fetchedShow;
        setShowsList((prev) =>
          prev.some((s) => s.id === fetchedShow.id) ? prev : [fetchedShow, ...prev]
        );
      }
    }

    if (targetShow) {
      setSelectedShow(targetShow);
    }
    setActiveTab('shows');
    setShowsViewMode('detail');

    const { data: epRow } = await supabase
      .from('qc_episodes')
      .select('*')
      .eq('show_uuid', targetShowUuid)
      .eq('episode_number', episodeNumber)
      .maybeSingle();

    if (epRow) {
      setPreviewError(''); setPreviewMode('adaptive');
      setPreviewEp(epRow);
    }
  };

  const handleSaveEpisode = async (e) => {
    e.preventDefault();
    if (!selectedShow?.id) return;

    const epNum = parseInt(modalEpNumber, 10);
    if (!epNum || epNum < 1) {
      alert('Invalid Episode Number.');
      return;
    }

    const trimmedUrl = modalDriveUrl.trim();
    const fileId = extractGoogleDriveId(trimmedUrl);
    if (!fileId) {
      alert(
        'Invalid Google Drive link. Please paste a valid Google Drive file link (e.g. https://drive.google.com/file/d/...).'
      );
      return;
    }

    setSubmitting(true);

    const existingEp = episodes.find((item) => item.episode_number === epNum);

    if (existingEp) {
      const { error } = await supabase
        .from('qc_episodes')
        .update({
          ep_name: modalEpName.trim() || `Episode ${epNum}`,
          drive_url: trimmedUrl,
          drive_file_id: fileId,
          scheduled_date: modalScheduledDate || existingEp.scheduled_date || null,
          status: 'Pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEp.id);

      setSubmitting(false);
      if (error) {
        alert('Failed to update episode: ' + error.message);
      } else {
        setUploadModalOpen(false);
        await fetchShowDetails(selectedShow.id);
        alert(
          `Episode ${epNum} submitted to QCstar! Status is now Pending QC.`
        );
      }
    } else {
      const { error } = await supabase.from('qc_episodes').insert([
        {
          show_uuid: selectedShow.id,
          episode_number: epNum,
          ep_name: modalEpName.trim() || `Episode ${epNum}`,
          drive_url: trimmedUrl,
          drive_file_id: fileId,
          scheduled_date: modalScheduledDate || null,
          status: 'Pending',
          feedback: [],
          updated_at: new Date().toISOString(),
        },
      ]);

      setSubmitting(false);
      if (error) {
        alert('Failed to submit episode: ' + error.message);
      } else {
        setUploadModalOpen(false);
        await fetchShowDetails(selectedShow.id);
        alert(
          `Episode ${epNum} added and submitted to QCstar! Status is now Pending QC.`
        );
      }
    }
  };

  if (loadingShows) {
    return (
      <div style={{ maxWidth: '720px', margin: '48px auto', padding: '0 20px' }}>
        <div className="panel">
          <p style={{ color: '#64748b', margin: 0 }}>Loading your Creator Workspace...</p>
        </div>
      </div>
    );
  }

  if (showsList.length === 0) {
    return (
      <div style={{ maxWidth: '640px', margin: '48px auto', padding: '0 20px' }}>
        <div className="panel" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h3 style={{ margin: '0 0 8px', color: '#0f172a' }}>No Active Shows Assigned Yet</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
            Your Creator ID is <strong>{creatorId || 'Pending'}</strong>. Once your QCstar creates and links a Show to your Creator ID, it will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  // Latest shows first
  const sortedShows = showsList
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

  // Episodes in strict descending order (Ep 5, Ep 4, Ep 3, Ep 2, Ep 1...)
  const submittedEpisodes = episodes
    .filter((ep) => ep.status !== 'Not Submitted' || Boolean(ep.drive_file_id))
    .slice()
    .sort((a, b) => Number(b.episode_number || 0) - Number(a.episode_number || 0));

  const changesRequestedEps = submittedEpisodes.filter(
    (ep) => ep.status === 'Changes Requested'
  );
  const approvedEps = submittedEpisodes.filter(
    (ep) => ep.status === 'Approved'
  );
  const pendingEps = submittedEpisodes.filter(
    (ep) => ep.status !== 'Approved' && ep.status !== 'Changes Requested'
  );

  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const monthItems = calendarEntries.filter((item) =>
    (item.schedule_date || '').startsWith(selectedMonth)
  );

  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push({ empty: true, key: `empty-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    const itemsForDay = monthItems.filter((e) => e.schedule_date === dateIso);
    calendarCells.push({ empty: false, day, dateIso, items: itemsForDay, key: dateIso });
  }

  const approvalRate =
    submittedEpisodes.length > 0
      ? Math.round((approvedEps.length / submittedEpisodes.length) * 100)
      : 0;

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 20px 104px' }}>
      {/* TOP CREATOR HEADER BAR */}
      <div className="panel" style={{ marginBottom: '18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={styles.creatorBadge}>Creator ID: {creatorId}</span>
              <span style={styles.showCountBadge}>
                {sortedShows.length} Assigned {sortedShows.length === 1 ? 'Show' : 'Shows'}
              </span>
            </div>
            <h2 style={{ margin: '8px 0 2px', fontSize: '21px', color: '#0f172a' }}>
              {selectedShow?.show_name}
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              {activeTab === 'home' && 'Creator workspace overview, pending re-edits, and assigned shows.'}
              {activeTab === 'shows' && 'Browse your assigned shows (latest first) and upload or manage episodes.'}
              {activeTab === 'calendar' && 'View scheduled episode release dates and upload Google Drive links.'}
              {activeTab === 'reports' && 'Monthly video submissions, QC status, and calendar target vs shared till date.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <CreatorNotificationBell
              showsList={sortedShows}
              onOpenEpisode={handleOpenNotificationEpisode}
            />

            <ShowSearchSelect shows={sortedShows} selectedShow={selectedShow} onSelectShow={(nextShow) => setSelectedShow(nextShow)} />
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM TAB 1: HOME
         ========================================================= */}
      {activeTab === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={styles.kpiGrid}>
            <div
              style={{ ...styles.kpiCard, cursor: 'pointer' }}
              onClick={() => {
                setActiveTab('shows');
                setShowsViewMode('list');
              }}
            >
              <span style={styles.kpiLabel}>ASSIGNED SHOWS</span>
              <strong style={styles.kpiValue}>{sortedShows.length}</strong>
              <span style={styles.kpiSub}>Latest: {sortedShows[0]?.show_name}</span>
            </div>

            <div
              style={{ ...styles.kpiCard, cursor: 'pointer' }}
              onClick={() => {
                setActiveTab('shows');
                setShowsViewMode('detail');
              }}
            >
              <span style={styles.kpiLabel}>SUBMITTED EPISODES</span>
              <strong style={styles.kpiValue}>{submittedEpisodes.length}</strong>
              <span style={styles.kpiSub}>{selectedShow?.show_name}</span>
            </div>

            <div
              style={{
                ...styles.kpiCard,
                borderColor: changesRequestedEps.length > 0 ? '#fca5a5' : '#e2e8f0',
                backgroundColor: changesRequestedEps.length > 0 ? '#fef2f2' : '#ffffff',
                cursor: 'pointer',
              }}
              onClick={() => {
                setActiveTab('shows');
                setShowsViewMode('detail');
              }}
            >
              <span style={{ ...styles.kpiLabel, color: '#b91c1c' }}>NEEDS RE-EDIT</span>
              <strong style={{ ...styles.kpiValue, color: '#b91c1c' }}>
                {changesRequestedEps.length}
              </strong>
              <span style={styles.kpiSub}>Changes requested by QCstar</span>
            </div>

            <div
              style={{ ...styles.kpiCard, cursor: 'pointer' }}
              onClick={() => setActiveTab('reports')}
            >
              <span style={{ ...styles.kpiLabel, color: '#166534' }}>APPROVED</span>
              <strong style={{ ...styles.kpiValue, color: '#15803d' }}>
                {approvedEps.length}
              </strong>
              <span style={styles.kpiSub}>{approvalRate}% QC pass rate</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Latest Assigned Shows</h3>
                <p>Click any show to open it and upload or view episodes (latest episode on top).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('shows');
                  setShowsViewMode('list');
                }}
                className="secondary-button"
                style={{ fontSize: '13px' }}
              >
                View All Shows →
              </button>
            </div>

            <div style={styles.showsGrid}>
              {sortedShows.slice(0, 4).map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedShow(s);
                    setActiveTab('shows');
                    setShowsViewMode('detail');
                  }}
                  style={{
                    ...styles.showCard,
                    borderColor: selectedShow?.id === s.id ? '#1e3a8a' : '#e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>{s.show_name}</strong>
                    {idx === 0 && <span style={styles.latestBadge}>LATEST</span>}
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Show ID: <strong>{s.show_id || s.creator_id || '—'}</strong>
                  </span>
                  <span style={{ fontSize: '12px', color: '#1e3a8a', fontWeight: '700', marginTop: '4px' }}>
                    Open Show &amp; Episodes →
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Recent Episodes — {selectedShow?.show_name}</h3>
                <p>Sorted from highest/latest episode number down.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('shows');
                  setShowsViewMode('detail');
                }}
                className="secondary-button"
                style={{ fontSize: '13px' }}
              >
                Manage in Show →
              </button>
            </div>

            {loadingData ? (
              <p style={{ color: '#64748b' }}>Loading episodes...</p>
            ) : submittedEpisodes.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>No episodes uploaded yet for {selectedShow?.show_name}.</strong>
                <span>Open the show in <strong>Shows</strong> to upload your first episode.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {submittedEpisodes.slice(0, 5).map((ep) => {
                  const badge = getCreatorStatusBadge(ep);
                  return (
                    <div key={ep.id} style={styles.episodeRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={styles.epPill}>Ep {ep.episode_number}</span>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          {ep.ep_name || `Episode ${ep.episode_number}`}
                        </strong>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: '700',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: badge.border,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {ep.drive_file_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewError(''); setPreviewMode('adaptive');
                              setPreviewEp(ep);
                            }}
                            className="secondary-button"
                            style={{ fontSize: '12px' }}
                          >
                            ▶ Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            openModalForEpisode({
                              epNumber: ep.episode_number,
                              epName: ep.ep_name,
                              driveUrl: ep.drive_url,
                              scheduledDate: ep.scheduled_date,
                            })
                          }
                          className="secondary-button"
                          style={{ fontSize: '12px' }}
                        >
                          Edit Link
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          BOTTOM TAB 2: SHOWS
         ========================================================= */}
      {activeTab === 'shows' && (
        <>
          {showsViewMode === 'list' ? (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Your Shows ({sortedShows.length})</h3>
                  <p>Latest shows appear at the top. Select any show to upload or view its episodes.</p>
                </div>
              </div>

              <div style={styles.showsGrid}>
                {sortedShows.map((s, idx) => {
                  const isSelected = selectedShow?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedShow(s);
                        setShowsViewMode('detail');
                      }}
                      style={{
                        ...styles.showCard,
                        borderColor: isSelected ? '#1e3a8a' : '#cbd5e1',
                        backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '17px', color: '#0f172a' }}>{s.show_name}</strong>
                        {idx === 0 && <span style={styles.latestBadge}>LATEST</span>}
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span>
                          Show ID: <strong>{s.show_id || s.creator_id || '—'}</strong>
                        </span>
                        {s.created_at && (
                          <span>
                            Added:{' '}
                            <strong>
                              {new Date(s.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </strong>
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e3a8a' }}>
                          Open Show &amp; Upload Episodes →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setShowsViewMode('list')}
                      className="secondary-button"
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      ← All Shows
                    </button>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                      Sorted: Latest Episode First (Ep {submittedEpisodes[0]?.episode_number || '—'} ↓)
                    </span>
                  </div>
                  <h3>{selectedShow?.show_name} — Episodes</h3>
                  <p>
                    {approvedEps.length} Approved · {changesRequestedEps.length} Changes Requested ·{' '}
                    {pendingEps.length} Pending QC
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openModalForEpisode()}
                  className="primary-button"
                >
                  + Upload Ep {getNextEpisodeNumber()}
                </button>
              </div>

              {loadingData ? (
                <p style={{ color: '#64748b' }}>Loading episodes...</p>
              ) : submittedEpisodes.length === 0 ? (
                <div style={styles.emptyBox}>
                  <strong>No episodes submitted yet for {selectedShow?.show_name}.</strong>
                  <span>
                    Click <strong>+ Upload Ep {getNextEpisodeNumber()}</strong> above to submit the first episode for this show.
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {submittedEpisodes.map((ep) => {
                    const badge = getCreatorStatusBadge(ep);
                    const feedbackItems = Array.isArray(ep.feedback) ? ep.feedback : [];

                    return (
                      <div
                        key={ep.id}
                        style={{
                          ...styles.episodeRow,
                          borderColor:
                            ep.status === 'Changes Requested'
                              ? '#fca5a5'
                              : ep.status === 'Approved'
                              ? '#86efac'
                              : '#e2e8f0',
                          backgroundColor:
                            ep.status === 'Changes Requested' ? '#fef2f2' : '#f8fafc',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={styles.epPill}>Ep {ep.episode_number}</span>
                            <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                              {ep.ep_name || `Episode ${ep.episode_number}`}
                            </strong>
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: badge.bg,
                                color: badge.color,
                                border: badge.border,
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#64748b' }}>
                            Scheduled Date: <strong>{ep.scheduled_date || 'Not set'}</strong>
                            {ep.reviewed_by && (
                              <>
                                {' '}
                                · Reviewed by: <strong>{ep.reviewed_by}</strong>
                              </>
                            )}
                          </p>

                          {feedbackItems.length > 0 && (
                            <div style={styles.feedbackSummaryBox}>
                              <strong style={{ fontSize: '12px', color: '#b91c1c' }}>
                                QCstar Notes ({feedbackItems.length}):
                              </strong>
                              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#1e293b' }}>
                                {feedbackItems
                                  .slice()
                                  .sort((a, b) => a.time - b.time)
                                  .map((fb) => (
                                    <li key={fb.id} style={{ marginBottom: '2px' }}>
                                      <strong>[{formatTime(fb.time)}]</strong> {fb.message}
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {ep.drive_file_id && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewError(''); setPreviewMode('adaptive');
                                setPreviewEp(ep);
                              }}
                              className="secondary-button"
                              style={{ fontSize: '12px', fontWeight: '700' }}
                            >
                              ▶ Watch &amp; Check Overlay
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              openModalForEpisode({
                                epNumber: ep.episode_number,
                                epName: ep.ep_name,
                                driveUrl: ep.drive_url,
                                scheduledDate: ep.scheduled_date,
                              })
                            }
                            className={
                              ep.status === 'Changes Requested'
                                ? 'primary-button'
                                : 'secondary-button'
                            }
                            style={{ fontSize: '12px', fontWeight: '700' }}
                          >
                            {ep.status === 'Changes Requested'
                              ? '↻ Re-upload Fixed Link'
                              : 'Edit Link'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* =========================================================
          BOTTOM TAB 3: CALENDAR
         ========================================================= */}
      {activeTab === 'calendar' && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>
                {selectedShow?.show_name} — {monthLabel}
              </h3>
              <p>
                Click any scheduled episode on the calendar to paste or update its Google Drive link.
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
            </div>
          </div>

          {loadingData ? (
            <p style={{ color: '#64748b' }}>Loading schedule...</p>
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

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          marginTop: '6px',
                        }}
                      >
                        {cell.items.map((item) => {
                          const epMatch = (item.episode_label || '').match(/ep\s*(\d+)/i);
                          const epNum = epMatch ? parseInt(epMatch[1], 10) : null;
                          const matchingEp = episodes.find(
                            (e) => e.episode_number === epNum
                          );
                          const badge = getCreatorStatusBadge(matchingEp);
                          const isSubmitted =
                            matchingEp && matchingEp.status !== 'Not Submitted';

                          return (
                            <div
                              key={item.id}
                              onClick={() =>
                                openModalForEpisode({
                                  epNumber: epNum || getNextEpisodeNumber(),
                                  epName:
                                    matchingEp?.ep_name ||
                                    item.notes ||
                                    item.episode_label,
                                  driveUrl: matchingEp?.drive_url || '',
                                  scheduledDate: item.schedule_date,
                                })
                              }
                              title="Click to upload or update Google Drive link for this episode"
                              style={{
                                ...styles.eventPill,
                                backgroundColor:
                                  matchingEp?.status === 'Approved'
                                    ? '#15803d'
                                    : matchingEp?.status === 'Changes Requested'
                                    ? '#b91c1c'
                                    : '#1e3a8a',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <strong style={{ fontSize: '12px' }}>
                                  {item.episode_label}
                                </strong>
                                <span style={styles.pillActionTag}>
                                  {isSubmitted ? 'Update' : '+ Upload'}
                                </span>
                              </div>

                              {item.notes && (
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: '10px',
                                    opacity: 0.9,
                                    marginTop: '2px',
                                  }}
                                >
                                  {item.notes}
                                </span>
                              )}

                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: '4px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  backgroundColor: 'rgba(255,255,255,0.18)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {badge.label}
                              </span>
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
      )}

      {/* =========================================================
          BOTTOM TAB 4: REPORTS (MONTHLY REPORT COMPONENT)
         ========================================================= */}
      {activeTab === 'reports' && (
        <CreatorMonthlyReport
          selectedShow={selectedShow}
          monthLabel={monthLabel}
          selectedMonth={selectedMonth}
          onChangeMonth={setSelectedMonth}
          onShiftMonth={shiftMonth}
          monthItems={monthItems}
          submittedEpisodes={submittedEpisodes}
          styles={styles}
          getCreatorStatusBadge={getCreatorStatusBadge}
          onPreviewEpisode={(ep) => {
            setPreviewError(''); setPreviewMode('adaptive');
            setPreviewEp(ep);
          }}
        />
      )}

      {/* =========================================================
          FIXED 4-OPTION BOTTOM NAVIGATION BAR
         ========================================================= */}
      <nav aria-label="Creator Navigation" style={bottomNavStyles.bar}>
        <div style={bottomNavStyles.inner}>
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            style={activeTab === 'home' ? bottomNavStyles.itemActive : bottomNavStyles.item}
          >
            <span style={bottomNavStyles.icon}>🏠</span>
            <span style={bottomNavStyles.label}>Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('shows');
              setShowsViewMode('list');
            }}
            style={activeTab === 'shows' ? bottomNavStyles.itemActive : bottomNavStyles.item}
          >
            <span style={bottomNavStyles.icon}>🎬</span>
            <span style={bottomNavStyles.label}>
              Shows
              {changesRequestedEps.length > 0 && (
                <span style={bottomNavStyles.badge}>{changesRequestedEps.length}</span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            style={activeTab === 'calendar' ? bottomNavStyles.itemActive : bottomNavStyles.item}
          >
            <span style={bottomNavStyles.icon}>📅</span>
            <span style={bottomNavStyles.label}>Calendar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            style={activeTab === 'reports' ? bottomNavStyles.itemActive : bottomNavStyles.item}
          >
            <span style={bottomNavStyles.icon}>📊</span>
            <span style={bottomNavStyles.label}>Reports</span>
          </button>
        </div>
      </nav>

      {/* MODAL: UPLOAD / UPDATE EPISODE GOOGLE DRIVE LINK */}
      {uploadModalOpen && (
        <div
          style={modalStyles.overlay}
          onClick={() => !submitting && setUploadModalOpen(false)}
        >
          <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '14px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>
                  {isNewEpisodeUpload
                    ? `Upload Episode ${modalEpNumber}`
                    : `Update Episode ${modalEpNumber}`}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Show: <strong>{selectedShow?.show_name}</strong> · Sent directly to QCstar for review.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setUploadModalOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '700',
                }}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveEpisode}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Episode Number (Auto)</label>
                  <input
                    type="number"
                    readOnly
                    value={modalEpNumber}
                    style={{
                      ...styles.input,
                      backgroundColor: '#f1f5f9',
                      color: '#0f172a',
                      fontWeight: '800',
                      cursor: 'not-allowed',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    {isNewEpisodeUpload
                      ? Number(modalEpNumber) > 1
                        ? `Auto-set after Ep ${Number(modalEpNumber) - 1}`
                        : 'First episode for this show'
                      : 'Locked to existing episode'}
                  </span>
                </div>

                <div>
                  <label style={styles.label}>Scheduled Date</label>
                  <input
                    type="date"
                    value={modalScheduledDate}
                    onChange={(e) => setModalScheduledDate(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>Episode Name / Title *</label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. Episode ${modalEpNumber}`}
                  value={modalEpName}
                  onChange={(e) => setModalEpName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>Google Drive Video Link *</label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/file/d/..."
                  value={modalDriveUrl}
                  onChange={(e) => setModalDriveUrl(e.target.value)}
                  style={styles.input}
                />
                <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Make sure Google Drive sharing is set to <strong>Anyone with the link</strong>.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="primary-button"
                style={{ marginTop: '6px' }}
              >
                {submitting
                  ? 'Submitting to QCstar...'
                  : `Submit Episode ${modalEpNumber} to QCstar →`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WATCH VIDEO WITH SAFE-ZONE OVERLAY & TIMESTAMPS */}
      {previewEp && (
        <div
          style={modalStyles.overlay}
          onClick={() => setPreviewEp(null)}
        >
          <div
            style={{ ...modalStyles.card, maxWidth: '820px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                  Ep {previewEp.episode_number}: {previewEp.ep_name}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Click any timestamp below to jump directly to that frame.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPreviewMode((m) => (m === 'adaptive' ? 'direct' : 'adaptive'))}
                  className="secondary-button"
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    backgroundColor: previewMode === 'adaptive' ? '#ecfdf5' : '#eff6ff',
                    borderColor: previewMode === 'adaptive' ? '#6ee7b7' : '#93c5fd',
                    color: previewMode === 'adaptive' ? '#065f46' : '#1e3a8a',
                  }}
                >
                  {previewMode === 'adaptive' ? '⚡ Fast Stream' : '🎯 Timestamp Sync'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOverlay((v) => !v)}
                  className="secondary-button"
                  style={{ fontSize: '12px' }}
                >
                  {showOverlay ? 'Hide Overlay' : 'Show Overlay'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewEp(null)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '700',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="video-stage" style={{ minHeight: '360px', marginBottom: '12px' }}>
              <div
                className="video-frame-wrapper"
                style={
                  previewMode === 'adaptive'
                    ? {
                        width: 'calc(55vh * 9 / 16)',
                        height: '55vh',
                        maxWidth: '100%',
                        margin: '0 auto',
                        overflow: 'hidden',
                      }
                    : { maxHeight: '55vh', margin: '0 auto' }
                }
              >
                {previewMode === 'adaptive' ? (
                  <iframe
                    key={previewEp.drive_file_id}
                    src={`https://drive.google.com/file/d/${previewEp.drive_file_id}/preview`}
                    title={`Ep ${previewEp.episode_number}`}
                    allow="autoplay; fullscreen"
                    style={{
                      width: '104%',
                      height: '55vh',
                      flexShrink: 0,
                      border: 'none',
                      backgroundColor: '#000000',
                      display: 'block',
                    }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={`${VIDEO_PROXY_URL}?id=${previewEp.drive_file_id}`}
                    preload="metadata"
                    controls
                    playsInline
                    className="review-video"
                    style={{ maxHeight: '55vh' }}
                    onError={() =>
                      setPreviewError(
                        'Could not stream video. Check that Google Drive access is set to "Anyone with the link".'
                      )
                    }
                  />
                )}
                <div className="overlay-frame-layer">
                  <ReferenceOverlay
                    src={overlayUrl || '/default-overlay.png'}
                    visible={showOverlay}
                    tolerance={100}
                    opacity={80}
                    size={100}
                    horizontal={50}
                    vertical={50}
                  />
                </div>
              </div>
            </div>

            {previewError && (
              <p style={{ color: '#b91c1c', fontSize: '13px', margin: '0 0 10px' }}>
                {previewError}
              </p>
            )}

            {Array.isArray(previewEp.feedback) && previewEp.feedback.length > 0 && (
              <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {previewEp.feedback
                  .slice()
                  .sort((a, b) => a.time - b.time)
                  .map((fb) => (
                    <div
                      key={fb.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (previewMode === 'adaptive') {
                            setPreviewMode('direct');
                            setTimeout(() => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = fb.time;
                                videoRef.current.play().catch(() => {});
                              }
                            }, 250);
                            return;
                          }
                          if (videoRef.current) {
                            videoRef.current.currentTime = fb.time;
                            videoRef.current.play().catch(() => {});
                          }
                        }}
                        className="feedback-time"
                      >
                        {formatTime(fb.time)}
                      </button>
                      <span style={{ fontSize: '13px', color: '#0f172a' }}>{fb.message}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const bottomNavStyles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTop: '1px solid #cbd5e1',
    boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.08)',
    zIndex: 900,
    padding: '8px 16px',
  },
  inner: {
    maxWidth: '720px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '8px 6px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontWeight: '600',
  },
  itemActive: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '8px 6px',
    borderRadius: '10px',
    border: '1px solid #bfdbfe',
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    cursor: 'pointer',
    fontWeight: '800',
  },
  icon: {
    fontSize: '18px',
    lineHeight: 1,
  },
  label: {
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
  },
  badge: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    borderRadius: '999px',
    padding: '1px 6px',
    fontSize: '10px',
    fontWeight: '800',
  },
};

const styles = {
  creatorBadge: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '800',
  },
  showCountBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
  },
  showSelect: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1.5px solid #cbd5e1',
    fontSize: '14px',
    fontWeight: '700',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    minWidth: '180px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '12px',
  },
  kpiCard: {
    backgroundColor: '#ffffff',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  kpiLabel: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: '0.04em',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 1.15,
  },
  kpiSub: {
    fontSize: '12px',
    color: '#64748b',
  },
  showsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
  },
  showCard: {
    backgroundColor: '#ffffff',
    border: '1.5px solid #cbd5e1',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
  },
  latestBadge: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: '800',
  },
  progressTrack: {
    width: '100%',
    height: '10px',
    backgroundColor: '#e2e8f0',
    borderRadius: '999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: '999px',
    transition: 'width 0.3s ease',
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
  eventPill: {
    color: '#ffffff',
    padding: '6px 8px',
    borderRadius: '7px',
    lineHeight: 1.25,
    cursor: 'pointer',
  },
  pillActionTag: {
    fontSize: '10px',
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.22)',
    padding: '1px 6px',
    borderRadius: '4px',
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
  episodeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1.5px solid #e2e8f0',
    flexWrap: 'wrap',
    gap: '12px',
  },
  epPill: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
  },
  feedbackSummaryBox: {
    marginTop: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    border: '1px solid #fecaca',
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