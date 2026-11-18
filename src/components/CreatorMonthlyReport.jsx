export default function CreatorMonthlyReport({
  selectedShow,
  monthLabel,
  selectedMonth,
  onChangeMonth,
  onShiftMonth,
  monthItems,
  submittedEpisodes,
  styles,
  getCreatorStatusBadge,
  onPreviewEpisode,
}) {
  const monthlyTargetCount = monthItems.length;

  const monthlySubmittedEps = submittedEpisodes.filter((ep) => {
    const schedMatch = (ep.scheduled_date || '').startsWith(selectedMonth);
    const updatedMatch =
      !ep.scheduled_date && (ep.updated_at || '').startsWith(selectedMonth);
    return schedMatch || updatedMatch;
  });

  const monthlySharedCount = monthlySubmittedEps.length;
  const monthlyApprovedCount = monthlySubmittedEps.filter(
    (ep) => ep.status === 'Approved'
  ).length;
  const monthlyPendingCount = monthlySubmittedEps.filter(
    (ep) => ep.status !== 'Approved'
  ).length;

  const targetCompletionPct =
    monthlyTargetCount > 0
      ? Math.min(100, Math.round((monthlySharedCount / monthlyTargetCount) * 100))
      : monthlySharedCount > 0
      ? 100
      : 0;

  const remainingTarget = Math.max(0, monthlyTargetCount - monthlySharedCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h3>
              Monthly Report — {selectedShow?.show_name} ({monthLabel})
            </h3>
            <p>
              Monthly video submissions, QC status, and calendar target vs shared till date.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onShiftMonth(-1)}
              className="secondary-button"
              style={{ padding: '7px 11px', fontSize: '13px' }}
            >
              ← Prev
            </button>

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => onChangeMonth(e.target.value)}
              style={styles.monthInput}
            />

            <button
              type="button"
              onClick={() => onShiftMonth(1)}
              className="secondary-button"
              style={{ padding: '7px 11px', fontSize: '13px' }}
            >
              Next →
            </button>
          </div>
        </div>

        <div style={styles.kpiGrid}>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>VIDEOS SHARED</span>
            <strong style={styles.kpiValue}>{monthlySharedCount}</strong>
            <span style={styles.kpiSub}>Submitted in {monthLabel}</span>
          </div>

          <div style={styles.kpiCard}>
            <span style={{ ...styles.kpiLabel, color: '#166534' }}>VIDEOS APPROVED</span>
            <strong style={{ ...styles.kpiValue, color: '#15803d' }}>
              {monthlyApprovedCount}
            </strong>
            <span style={styles.kpiSub}>Cleared by QCstar</span>
          </div>

          <div style={styles.kpiCard}>
            <span style={{ ...styles.kpiLabel, color: '#92400e' }}>VIDEOS QC PENDING</span>
            <strong style={{ ...styles.kpiValue, color: '#b45309' }}>
              {monthlyPendingCount}
            </strong>
            <span style={styles.kpiSub}>Awaiting approval / re-edit</span>
          </div>

          <div
            style={{
              ...styles.kpiCard,
              borderColor: '#93c5fd',
              backgroundColor: '#eff6ff',
            }}
          >
            <span style={{ ...styles.kpiLabel, color: '#1e3a8a' }}>
              CALENDAR TARGET VS SHARED
            </span>
            <strong style={{ ...styles.kpiValue, color: '#1e3a8a' }}>
              {monthlySharedCount} / {monthlyTargetCount}
            </strong>
            <span style={styles.kpiSub}>
              {monthlyTargetCount === 0
                ? 'No calendar slots set for this month'
                : remainingTarget === 0
                ? 'Monthly calendar target completed!'
                : `${remainingTarget} remaining out of ${monthlyTargetCount} scheduled`}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '18px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              fontWeight: '700',
              color: '#334155',
              marginBottom: '6px',
            }}
          >
            <span>
              Monthly Target Completion ({monthlySharedCount} of {monthlyTargetCount} shared till date)
            </span>
            <span>{targetCompletionPct}%</span>
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                backgroundColor: '#1e3a8a',
                width: `${targetCompletionPct}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h3>{monthLabel} Episode Breakdown (Latest First)</h3>
            <p>Episodes shared or scheduled in {monthLabel}.</p>
          </div>
        </div>

        {monthlySubmittedEps.length === 0 ? (
          <div style={styles.emptyBox}>
            <strong>No videos shared in {monthLabel} yet.</strong>
            <span>
              Calendar Target for {monthLabel}: <strong>{monthlyTargetCount}</strong>{' '}
              {monthlyTargetCount === 1 ? 'episode' : 'episodes'}.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {monthlySubmittedEps.map((ep) => {
              const badge = getCreatorStatusBadge(ep);
              const notesCount = Array.isArray(ep.feedback) ? ep.feedback.length : 0;
              return (
                <div key={ep.id} style={styles.episodeRow}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                      Scheduled: <strong>{ep.scheduled_date || 'Not set'}</strong> ·{' '}
                      Reviewer: <strong>{ep.reviewed_by || 'Pending'}</strong> ·{' '}
                      QC Notes: <strong>{notesCount}</strong>
                    </p>
                  </div>

                  {ep.drive_file_id && (
                    <button
                      type="button"
                      onClick={() => onPreviewEpisode(ep)}
                      className="secondary-button"
                      style={{ fontSize: '12px' }}
                    >
                      View Details
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}