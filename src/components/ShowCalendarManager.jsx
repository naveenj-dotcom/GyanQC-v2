import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function ShowCalendarManager({
  shows,
  selectedShow,
  onSelectShow,
  currentUser,
  onBackToStudio,
}) {
  // Only allow editing Active Shows
  const activeShows = shows.filter((s) => s.status !== 'ended');

  // Step 1: Show Picker Screen before opening the Show's Calendar
  const [editingShow, setEditingShow] = useState(null);

  // Draft Calendar Entries (staged locally until "Save Calendar Changes" is clicked)
  const [draftEntries, setDraftEntries] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [submittedEpisodes, setSubmittedEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [defaultNote, setDefaultNote] = useState('');

  // Default to current month (with month picker for next/any month)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  const loadShowScheduleData = async (showUuid) => {
    if (!showUuid) return;
    setLoading(true);

    const [{ data: calData }, { data: epData }] = await Promise.all([
      supabase
        .from('qc_show_calendar')
        .select('*')
        .eq('show_uuid', showUuid)
        .order('schedule_date', { ascending: true }),
      supabase
        .from('qc_episodes')
        .select('episode_number, ep_name, status')
        .eq('show_uuid', showUuid),
    ]);

    setDraftEntries(calData || []);
    setDeletedIds([]);
    setHasUnsavedChanges(false);
    setSubmittedEpisodes(epData || []);
    setLoading(false);
  };

  const handleChooseShowToEdit = (showObj) => {
    setEditingShow(showObj);
    if (onSelectShow) onSelectShow(showObj);
    loadShowScheduleData(showObj.id);
  };

  // Automatically recognize the highest episode number across draft calendar & submitted episodes
  const getNextEpisodeNumber = () => {
    let maxEp = 0;

    draftEntries.forEach((entry) => {
      const match = (entry.episode_label || '').match(/ep\s*(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxEp) maxEp = num;
      }
    });

    submittedEpisodes.forEach((ep) => {
      if (ep.status !== 'Not Submitted' || (ep.ep_name && ep.ep_name.trim() !== '')) {
        if (ep.episode_number > maxEp) maxEp = ep.episode_number;
      }
    });

    return maxEp + 1;
  };

  const nextEpNum = getNextEpisodeNumber();

  // Stage adding an episode date locally (commits when "Save Calendar Changes" is clicked)
  const handleStageDate = (dateIso) => {
    if (!editingShow) return;

    const newItem = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isNew: true,
      show_uuid: editingShow.id,
      schedule_date: dateIso,
      episode_label: `Ep ${nextEpNum}`,
      notes: defaultNote.trim(),
      updated_by: currentUser.full_name,
    };

    setDraftEntries((prev) => [...prev, newItem]);
    setHasUnsavedChanges(true);
  };

  // Stage deleting an entry locally
  const handleStageDelete = (e, item) => {
    e.stopPropagation();
    if (!item.isNew) {
      setDeletedIds((prev) => [...prev, item.id]);
    }
    setDraftEntries((prev) => prev.filter((entry) => entry.id !== item.id));
    setHasUnsavedChanges(true);
  };

  // Commit all staged additions & deletions to Supabase so it updates everywhere (QCstar + Creator/Agency)
  const handleSaveAllChanges = async () => {
    if (!editingShow) return;
    setSavingAll(true);

    try {
      // 1. Delete removed rows
      if (deletedIds.length > 0) {
        const { error: delError } = await supabase
          .from('qc_show_calendar')
          .delete()
          .in('id', deletedIds);
        if (delError) throw delError;
      }

      // 2. Insert newly added rows
      const newRows = draftEntries
        .filter((item) => item.isNew)
        .map((item) => ({
          show_uuid: editingShow.id,
          schedule_date: item.schedule_date,
          episode_label: item.episode_label,
          notes: item.notes,
          updated_by: currentUser.full_name,
        }));

      if (newRows.length > 0) {
        const { error: insError } = await supabase
          .from('qc_show_calendar')
          .insert(newRows);
        if (insError) throw insError;
      }

      await loadShowScheduleData(editingShow.id);
      alert(`Calendar saved for "${editingShow.show_name}"! Updated everywhere including Creator/Agency portal.`);
    } catch (err) {
      alert('Error saving calendar changes: ' + err.message);
    } finally {
      setSavingAll(false);
    }
  };

  // =========================================================================
  // STEP 1: SELECT AN ACTIVE SHOW TO EDIT ITS CALENDAR
  // =========================================================================
  if (!editingShow) {
    return (
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '20px' }}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <button
                type="button"
                onClick={onBackToStudio}
                className="secondary-button"
                style={{ marginBottom: '10px', padding: '5px 12px', fontSize: '12px' }}
              >
                ← Back to Master Calendar
              </button>
              <h3>Edit Calendar — Select an Active Show</h3>
              <p>Choose which active Show's release schedule you want to edit.</p>
            </div>
          </div>

          {activeShows.length === 0 ? (
            <div style={styles.emptyBox}>
              <strong>No active Shows found.</strong>
              <span>Create a Show first in the Shows tab to edit its calendar.</span>
            </div>
          ) : (
            <div style={styles.showsPickerGrid}>
              {activeShows.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleChooseShowToEdit(s)}
                  style={styles.showPickCard}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={styles.showIdTag}>ID: {s.show_id}</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e3a8a' }}>
                      Edit Schedule →
                    </span>
                  </div>
                  <h4 style={{ margin: '10px 0 4px', fontSize: '18px', color: '#0f172a' }}>
                    {s.show_name}
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                    Agency: <strong>{s.agency_name}</strong> · Creator: <strong>{s.creator_name}</strong>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // STEP 2: EDIT SELECTED SHOW'S CALENDAR & SAVE CHANGES
  // =========================================================================
  const [yearStr, monthStr] = selectedMonth.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay();
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const filteredMonthEntries = draftEntries.filter((entry) =>
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

  return (
    <div style={{ maxWidth: '1380px', margin: '0 auto', padding: '20px' }}>
      {/* Top Control Bar with Save Button */}
      <div className="panel" style={styles.topControlBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              if (
                hasUnsavedChanges &&
                !window.confirm('You have unsaved calendar changes. Discard them and switch Show?')
              ) {
                return;
              }
              setEditingShow(null);
            }}
            className="secondary-button"
          >
            ← Change Show
          </button>

          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
              Editing Calendar: {editingShow.show_name}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Click any date to assign <strong>Ep {nextEpNum}</strong>, then click <strong>Save Calendar Changes</strong>.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={styles.autoEpBanner}>
            <span style={{ fontSize: '12px', color: '#1e3a8a', fontWeight: '600' }}>
              Next Click → <strong>Ep {nextEpNum}</strong>
            </span>
          </div>

          <button
            type="button"
            disabled={savingAll || !hasUnsavedChanges}
            onClick={handleSaveAllChanges}
            style={{
              backgroundColor: hasUnsavedChanges ? '#16a34a' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: hasUnsavedChanges ? 'pointer' : 'default',
            }}
          >
            {savingAll
              ? 'Saving...'
              : hasUnsavedChanges
              ? '💾 Save Calendar Changes'
              : '✓ All Changes Saved'}
          </button>
        </div>
      </div>

      {/* Month & Note Controls */}
      <div className="panel" style={{ marginTop: '16px' }}>
        <div style={styles.filterGrid}>
          <div>
            <label style={styles.label}>Active Show</label>
            <input
              type="text"
              readOnly
              value={`${editingShow.show_name} (ID: ${editingShow.show_id})`}
              style={{ ...styles.input, backgroundColor: '#f1f5f9', fontWeight: '600' }}
            />
          </div>

          <div>
            <label style={styles.label}>Planning Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Optional Note for Clicked Dates (e.g. "Final Cut Due")</label>
            <input
              type="text"
              placeholder="Optional delivery note..."
              value={defaultNote}
              onChange={(e) => setDefaultNote(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        {/* Full-Page Visual Monthly Calendar */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              {monthLabel} ({filteredMonthEntries.length} episodes scheduled)
            </h3>
            {hasUnsavedChanges && (
              <span style={{ fontSize: '13px', color: '#b45309', fontWeight: '700' }}>
                ● Unsaved changes — click "Save Calendar Changes" to publish
              </span>
            )}
          </div>

          {loading ? (
            <p style={{ color: '#64748b' }}>Loading show calendar...</p>
          ) : (
            <>
              <div style={styles.weekHeaderGrid}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
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
                      onClick={() => handleStageDate(cell.dateIso)}
                      title={`Click to schedule Ep ${nextEpNum} on ${cell.dateIso}`}
                      style={{
                        ...styles.calendarCell,
                        backgroundColor: cell.items.length > 0 ? '#eff6ff' : '#ffffff',
                        borderColor: cell.items.length > 0 ? '#60a5fa' : '#cbd5e1',
                      }}
                    >
                      <div style={styles.cellTopRow}>
                        <span style={styles.dayNumber}>{cell.day}</span>
                        <span style={styles.addHint}>+ Ep {nextEpNum}</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        {cell.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              ...styles.eventCard,
                              backgroundColor: item.isNew ? '#1d4ed8' : '#1e3a8a',
                              border: item.isNew ? '1px dashed #93c5fd' : 'none',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '13px' }}>
                                {item.episode_label} {item.isNew ? '(New)' : ''}
                              </strong>
                              <button
                                type="button"
                                onClick={(e) => handleStageDelete(e, item)}
                                title="Remove from this date"
                                style={styles.removeMiniBtn}
                              >
                                ✕
                              </button>
                            </div>
                            {item.notes && (
                              <span style={{ display: 'block', fontSize: '11px', marginTop: '2px', opacity: 0.92 }}>
                                {item.notes}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  showsPickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: '14px',
  },
  showPickCard: {
    textAlign: 'left',
    padding: '18px',
    borderRadius: '12px',
    border: '1.5px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  showIdTag: {
    backgroundColor: '#e0e7ff',
    color: '#1e3a8a',
    padding: '3px 9px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
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
  topControlBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
  },
  autoEpBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    padding: '8px 14px',
    borderRadius: '10px',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 200px 1.6fr',
    gap: '14px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '5px',
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
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  cellTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#0f172a',
  },
  addHint: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    padding: '2px 7px',
    borderRadius: '999px',
  },
  eventCard: {
    color: '#ffffff',
    padding: '6px 8px',
    borderRadius: '7px',
    lineHeight: 1.25,
  },
  removeMiniBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '1px 5px',
    fontSize: '11px',
    cursor: 'pointer',
  },
};