import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function QcstarPortal({
  activeTab,
  subView,
  onNavigate,
  shows,
  currentUser,
  onShowCreated,
  onShowsUpdated,
  onOpenEpisodeInStudio,
  onOpenMonthlyPlanner,
}) {
  const todayIso = formatLocalDate(new Date());

  const activeShows = shows.filter((s) => s.status !== "ended");
  const endedShows = shows.filter((s) => s.status === "ended");

  const [selectedShowId, setSelectedShowId] = useState(
    () => activeShows[0]?.id || shows[0]?.id || ""
  );
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [calendarRows, setCalendarRows] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const [pendingByShow, setPendingByShow] = useState({});
  const [totalPendingEpisodes, setTotalPendingEpisodes] = useState(0);

  // Episode # search filter inside Shows view (handles 200+ episodes cleanly)
  const [episodeFilter, setEpisodeFilter] = useState("");

  // Manage Shows status filter: "active" | "ended" | "all"
  const [manageShowFilter, setManageShowFilter] = useState("active");
  const [updatingShowId, setUpdatingShowId] = useState(null);

  // Create Show form state
  const [showName, setShowName] = useState("");
  const [creatorIdInput, setCreatorIdInput] = useState("");
  const [totalEpisodes, setTotalEpisodes] = useState(10);
  const [creatingShow, setCreatingShow] = useState(false);
  const [createdBanner, setCreatedBanner] = useState(null);

  // Creators directory state
  const [creators, setCreators] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(false);

  useEffect(() => {
    const validCurrent = shows.some((s) => s.id === selectedShowId);
    if (!validCurrent) {
      const next = activeShows[0]?.id || shows[0]?.id || "";
      if (next) setSelectedShowId(next);
    }
  }, [shows, selectedShowId]);

  const fetchPendingCounts = async () => {
    const activeIds = activeShows.map((s) => s.id);
    if (activeIds.length === 0) {
      setPendingByShow({});
      setTotalPendingEpisodes(0);
      return;
    }

    const { data, error } = await supabase
      .from("qc_episodes")
      .select("id, show_uuid, status")
      .in("show_uuid", activeIds)
      .neq("status", "Approved")
      .neq("status", "Not Submitted");

    if (!error && Array.isArray(data)) {
      const counts = {};
      data.forEach((ep) => {
        counts[ep.show_uuid] = (counts[ep.show_uuid] || 0) + 1;
      });
      setPendingByShow(counts);
      setTotalPendingEpisodes(data.length);
    }
  };

  useEffect(() => {
    fetchPendingCounts();
  }, [shows]);

  useEffect(() => {
    if (!selectedShowId) {
      setEpisodes([]);
      return;
    }
    setLoadingEpisodes(true);
    supabase
      .from("qc_episodes")
      .select("*")
      .eq("show_uuid", selectedShowId)
      .order("episode_number", { ascending: false })
      .then(({ data }) => {
        setEpisodes(data || []);
        setLoadingEpisodes(false);
      });
  }, [selectedShowId, shows]);

  useEffect(() => {
    if (activeTab !== "calendar") return;
    setLoadingCalendar(true);
    supabase
      .from("qc_show_calendar")
      .select("*")
      .eq("schedule_date", selectedDate)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setCalendarRows(data || []);
        setLoadingCalendar(false);
      });
  }, [activeTab, selectedDate]);

  useEffect(() => {
    if (subView !== "creators") return;
    setLoadingCreators(true);
    supabase
      .from("qc_users")
      .select("id, full_name, email, show_id, status, created_at")
      .eq("role", "creator")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCreators(data || []);
        setLoadingCreators(false);
      });
  }, [subView]);

  const handleCreateShow = async (e) => {
    e.preventDefault();
    const trimmedName = showName.trim();
    const trimmedCreatorId = creatorIdInput.trim().toUpperCase();
    if (!trimmedName || !trimmedCreatorId) return;

    setCreatingShow(true);
    setCreatedBanner(null);

    const uniqueShowCode =
      "SHW-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    const { data: newShow, error } = await supabase
      .from("qc_shows")
      .insert([
        {
          show_id: uniqueShowCode,
          show_name: trimmedName,
          creator_id: trimmedCreatorId,
          total_episodes: Number(totalEpisodes) || 10,
          status: "active",
          created_by: currentUser?.full_name || "QCstar",
        },
      ])
      .select()
      .single();

    if (error) {
      setCreatingShow(false);
      alert("Could not create show: " + error.message);
      return;
    }

    const count = Math.min(Math.max(Number(totalEpisodes) || 1, 1), 250);
    const starterEpisodes = Array.from({ length: count }, (_, idx) => ({
      show_uuid: newShow.id,
      episode_number: idx + 1,
      ep_name: `Episode ${idx + 1}`,
      status: "Not Submitted",
      feedback: [],
    }));

    await supabase.from("qc_episodes").insert(starterEpisodes);

    setCreatingShow(false);
    setShowName("");
    setCreatorIdInput("");
    setTotalEpisodes(10);
    setCreatedBanner(newShow);
    setSelectedShowId(newShow.id);

    if (onShowCreated) {
      await onShowCreated(newShow);
    }
  };

  const handleToggleShowStatus = async (showObj, nextStatus) => {
    const label = nextStatus === "ended" ? "End Show" : "Reopen Show";
    const confirmMsg =
      nextStatus === "ended"
        ? `Mark "${showObj.show_name}" as Ended? Its episodes will be excluded from active pending QC counts and hidden from the Creator portal until reopened.`
        : `Reopen "${showObj.show_name}" as Active?`;

    if (!window.confirm(confirmMsg)) return;

    setUpdatingShowId(showObj.id);
    const { error } = await supabase
      .from("qc_shows")
      .update({ status: nextStatus })
      .eq("id", showObj.id);

    setUpdatingShowId(null);
    if (error) {
      alert(`Failed to ${label}: ` + error.message);
      return;
    }

    if (onShowsUpdated) {
      await onShowsUpdated();
    }
  };

  const handleDeleteShow = async (showObj) => {
    const confirmMsg = `Permanently delete "${showObj.show_name}" and all its episodes & calendar entries? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setUpdatingShowId(showObj.id);

    // Clean up child records first, then delete the show
    await supabase.from("qc_show_calendar").delete().eq("show_uuid", showObj.id);
    await supabase.from("qc_episodes").delete().eq("show_uuid", showObj.id);

    const { error } = await supabase
      .from("qc_shows")
      .delete()
      .eq("id", showObj.id);

    setUpdatingShowId(null);
    if (error) {
      alert("Failed to delete show: " + error.message);
      return;
    }

    if (onShowsUpdated) {
      await onShowsUpdated();
    }
  };

  const selectedShow = shows.find((s) => s.id === selectedShowId) || null;

  const shiftDate = (days) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const next = new Date(y, m - 1, d + days);
    setSelectedDate(formatLocalDate(next));
  };

  const getEpisodeBadgeStyle = (status) => {
    if (status === "Approved") {
      return {
        backgroundColor: "#dcfce7",
        color: "#166534",
        border: "1px solid #86efac",
      };
    }
    if (status === "Changes Requested") {
      return {
        backgroundColor: "#fee2e2",
        color: "#b91c1c",
        border: "1px solid #fca5a5",
      };
    }
    if (status === "Not Submitted") {
      return {
        backgroundColor: "#f1f5f9",
        color: "#475569",
        border: "1px solid #cbd5e1",
      };
    }
    return {
      backgroundColor: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  };

  // Filtered episodes for the selected show (supports 200+ episodes cleanly)
  const filteredEpisodes = episodes.filter((ep) => {
    const q = episodeFilter.trim().toLowerCase();
    if (!q) return true;
    const cleanNum = q.replace(/^ep\s*/i, "");
    return (
      String(ep.episode_number).includes(cleanNum) ||
      (ep.ep_name || "").toLowerCase().includes(q)
    );
  });

  // =========================================================
  // 1. QCSTAR & ADMIN HOME PORTAL (4 CORE ACTION CARDS)
  // =========================================================
  if (activeTab === "home") {
    return (
      <div style={styles.portalWrap}>
        <div className="panel" style={{ marginBottom: "20px" }}>
          <div style={styles.heroHeader}>
            <div>
              <span style={styles.rolePill}>
                {currentUser?.role === "admin"
                  ? "ADMIN + QCSTAR WORKSPACE"
                  : "QCSTAR WORKSPACE"}
              </span>
              <h2 style={styles.heroTitle}>
                Welcome back, {currentUser?.full_name}
              </h2>
              <p style={styles.heroSub}>
                Select a workspace module below to check today&apos;s schedule, manage shows, or jump directly into the QC Studio.
              </p>
            </div>
          </div>

          <div style={styles.cardsGrid4}>
            {/* CARD 1: CALENDAR */}
            <button
              type="button"
              onClick={() => onNavigate("calendar")}
              style={{ ...styles.navCard, borderTop: "4px solid #2563eb" }}
            >
              <div style={styles.cardTopRow}>
                <span style={{ ...styles.cardIconBox, backgroundColor: "#eff6ff" }}>
                  📅
                </span>
                <span style={styles.cardArrow}>Open →</span>
              </div>
              <h3 style={styles.cardTitle}>Calendar</h3>
              <p style={styles.cardDesc}>
                Inspect daily episode schedules across all shows or jump to any date and monthly planner.
              </p>
            </button>

            {/* CARD 2: SHOWS (WITH PENDING QC COUNT BADGE) */}
            <button
              type="button"
              onClick={() => onNavigate("shows")}
              style={{ ...styles.navCard, borderTop: "4px solid #16a34a" }}
            >
              <div style={styles.cardTopRow}>
                <span style={{ ...styles.cardIconBox, backgroundColor: "#f0fdf4" }}>
                  🎬
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {totalPendingEpisodes > 0 && (
                    <span style={styles.pendingAlertBadge}>
                      {totalPendingEpisodes} Pending QC
                    </span>
                  )}
                  <span style={styles.cardArrow}>Open →</span>
                </div>
              </div>
              <h3 style={styles.cardTitle}>Shows</h3>
              <p style={styles.cardDesc}>
                Browse active shows ({activeShows.length}), track pending episodes, and launch episodes in QC Studio.
              </p>
            </button>

            {/* CARD 3: QC STUDIO */}
            <button
              type="button"
              onClick={() => onNavigate("studio")}
              style={{ ...styles.navCard, borderTop: "4px solid #7c3aed" }}
            >
              <div style={styles.cardTopRow}>
                <span style={{ ...styles.cardIconBox, backgroundColor: "#f5f3ff" }}>
                  ▶️
                </span>
                <span style={styles.cardArrow}>Launch →</span>
              </div>
              <h3 style={styles.cardTitle}>QC Studio</h3>
              <p style={styles.cardDesc}>
                Open the 9:16 video player directly to upload a local video or paste a Google Drive link for quick QC.
              </p>
            </button>

            {/* CARD 4: CREATE NEW SHOW */}
            <button
              type="button"
              onClick={() => onNavigate("create-show")}
              style={{ ...styles.navCard, borderTop: "4px solid #ea580c" }}
            >
              <div style={styles.cardTopRow}>
                <span style={{ ...styles.cardIconBox, backgroundColor: "#fff7ed" }}>
                  ➕
                </span>
                <span style={styles.cardArrow}>Create →</span>
              </div>
              <h3 style={styles.cardTitle}>Create New Show</h3>
              <p style={styles.cardDesc}>
                Create a new Show and link it to a Creator&apos;s unique Creator ID so their calendar and upload queue appear automatically.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // 2. CREATE NEW SHOW PAGE
  // =========================================================
  if (activeTab === "create-show") {
    return (
      <div style={{ maxWidth: "680px", margin: "24px auto", padding: "0 20px" }}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Create New Show</h3>
              <p>
                Enter the Show Name and the Creator&apos;s unique Creator ID (e.g., <strong>CRT-101</strong>) to link this show to their Creator Portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("shows")}
              className="secondary-button"
              style={{ fontSize: "13px" }}
            >
              ← Back to Shows
            </button>
          </div>

          {createdBanner && (
            <div style={styles.successBanner}>
              <strong>
                ✓ Show &ldquo;{createdBanner.show_name}&rdquo; created!
              </strong>
              <span>
                Linked to Creator ID: <strong>{createdBanner.creator_id}</strong> (Show Code:{" "}
                <strong>{createdBanner.show_id}</strong>)
              </span>
            </div>
          )}

          <form
            onSubmit={handleCreateShow}
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <div>
              <label style={styles.label}>Show Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Science Mysteries Season 1"
                value={showName}
                onChange={(e) => setShowName(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.twoColFormGrid}>
              <div>
                <label style={styles.label}>Creator ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CRT-101"
                  value={creatorIdInput}
                  onChange={(e) => setCreatorIdInput(e.target.value)}
                  style={{ ...styles.input, textTransform: "uppercase" }}
                />
                <span style={styles.helperText}>
                  Must match the Creator ID given to the Creator/Agency.
                </span>
              </div>

              <div>
                <label style={styles.label}>Planned Episodes</label>
                <input
                  type="number"
                  min="1"
                  max="250"
                  value={totalEpisodes}
                  onChange={(e) => setTotalEpisodes(e.target.value)}
                  style={styles.input}
                />
                <span style={styles.helperText}>
                  Auto-creates starter episode slots (1 to {totalEpisodes || 10}).
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
              <button
                type="submit"
                disabled={creatingShow}
                className="primary-button"
              >
                {creatingShow ? "Creating Show..." : "Create Show & Link Creator"}
              </button>

              <button
                type="button"
                onClick={() => onNavigate("home")}
                className="secondary-button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================
  // 3. DAILY SCHEDULE CALENDAR VIEW
  // =========================================================
  if (activeTab === "calendar") {
    return (
      <div style={styles.portalWrap}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Daily Episode Schedule</h3>
              <p>
                Viewing all scheduled episodes across shows for{" "}
                <strong>{selectedDate}</strong>
                {selectedDate === todayIso ? " (Today)" : ""}.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="secondary-button"
                style={{ padding: "7px 11px", fontSize: "13px" }}
              >
                ← Prev
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={styles.dateInput}
              />

              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="secondary-button"
                style={{ padding: "7px 11px", fontSize: "13px" }}
              >
                Next →
              </button>

              {selectedDate !== todayIso && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayIso)}
                  className="secondary-button"
                  style={{ padding: "7px 11px", fontSize: "13px", fontWeight: "700" }}
                >
                  Today
                </button>
              )}

              <button
                type="button"
                onClick={onOpenMonthlyPlanner}
                className="primary-button"
                style={{ fontSize: "13px" }}
              >
                📆 Open Monthly Planner
              </button>
            </div>
          </div>

          {loadingCalendar ? (
            <p style={{ color: "#64748b" }}>Loading schedule for {selectedDate}...</p>
          ) : calendarRows.length === 0 ? (
            <div style={styles.emptyBox}>
              <strong>No episodes scheduled for {selectedDate}.</strong>
              <span>
                Use the date picker above to check another date, or open the Monthly Planner to schedule episodes.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {calendarRows.map((entry) => {
                const parentShow = shows.find((s) => s.id === entry.show_uuid);
                return (
                  <div key={entry.id} style={styles.calendarEntryCard}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={styles.showTag}>
                          {parentShow?.show_name || "Show"}
                        </span>
                        {parentShow?.creator_id && (
                          <span style={styles.creatorTag}>
                            Creator: {parentShow.creator_id}
                          </span>
                        )}
                      </div>
                      <h4 style={{ margin: "6px 0 2px", fontSize: "16px", color: "#0f172a" }}>
                        {entry.episode_label}
                      </h4>
                      {entry.notes && (
                        <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    {parentShow && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShowId(parentShow.id);
                          onNavigate("shows");
                        }}
                        className="secondary-button"
                        style={{ fontSize: "13px" }}
                      >
                        View Show Episodes →
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

  // =========================================================
  // 4. SHOWS DIRECTORY + SUB-VIEWS (ACTIVE SHOWS / MANAGE SHOWS / CREATORS)
  // =========================================================
  const managedShowsList = shows.filter((s) => {
    if (manageShowFilter === "active") return s.status !== "ended";
    if (manageShowFilter === "ended") return s.status === "ended";
    return true;
  });

  return (
    <div style={styles.portalWrap}>
      {/* SHOWS ACTION BAR */}
      <div className="panel" style={{ marginBottom: "18px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate("shows")}
              style={
                subView === "shows" ? styles.subTabActive : styles.subTabInactive
              }
            >
              🎬 Active Shows ({activeShows.length})
              {totalPendingEpisodes > 0 && (
                <span style={styles.pendingMiniPill}>{totalPendingEpisodes}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigate("manage-shows")}
              style={
                subView === "manage-shows"
                  ? styles.subTabActive
                  : styles.subTabInactive
              }
            >
              ⚙️ Manage Shows ({shows.length})
            </button>

            <button
              type="button"
              onClick={() => onNavigate("creators")}
              style={
                subView === "creators"
                  ? styles.subTabActive
                  : styles.subTabInactive
              }
            >
              👤 Creators Directory
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("create-show")}
            className="primary-button"
            style={{ fontSize: "13px" }}
          >
            + Create New Show
          </button>
        </div>
      </div>

      {/* SUB-VIEW A: MANAGE SHOWS (ACTIVE / ENDED TOGGLE) */}
      {subView === "manage-shows" ? (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Manage Shows ({shows.length})</h3>
              <p>
                End completed shows to remove their pending counts from the QC queue, or reopen ended shows anytime.
              </p>
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[
                { key: "active", label: `Active (${activeShows.length})` },
                { key: "ended", label: `Ended (${endedShows.length})` },
                { key: "all", label: `All (${shows.length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setManageShowFilter(tab.key)}
                  style={
                    manageShowFilter === tab.key
                      ? styles.filterPillActive
                      : styles.filterPillInactive
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {managedShowsList.length === 0 ? (
            <div style={styles.emptyBox}>
              <strong>No shows in this filter.</strong>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {managedShowsList.map((s) => {
                const isEnded = s.status === "ended";
                const pendingCount = pendingByShow[s.id] || 0;
                return (
                  <div
                    key={s.id}
                    style={{
                      ...styles.manageShowRow,
                      backgroundColor: isEnded ? "#f8fafc" : "#ffffff",
                      borderColor: isEnded ? "#cbd5e1" : "#bfdbfe",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "16px", color: "#0f172a" }}>
                          {s.show_name}
                        </strong>
                        <span
                          style={
                            isEnded ? styles.endedStatusPill : styles.activeStatusPill
                          }
                        >
                          {isEnded ? "Ended" : "Active"}
                        </span>
                        {!isEnded && pendingCount > 0 && (
                          <span style={styles.pendingAlertBadge}>
                            {pendingCount} Pending QC
                          </span>
                        )}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                        Show ID: <strong>{s.show_id}</strong> · Creator ID:{" "}
                        <strong>{s.creator_id || "—"}</strong> · Planned Episodes:{" "}
                        <strong>{s.total_episodes || 0}</strong>
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShowId(s.id);
                          onNavigate("shows");
                        }}
                        className="secondary-button"
                        style={{ fontSize: "12px" }}
                      >
                        Open Episodes
                      </button>

                      {isEnded ? (
                        <>
                          <button
                            type="button"
                            disabled={updatingShowId === s.id}
                            onClick={() => handleToggleShowStatus(s, "active")}
                            className="primary-button"
                            style={{ fontSize: "12px", padding: "7px 12px" }}
                          >
                            {updatingShowId === s.id ? "Updating..." : "↻ Reopen Show"}
                          </button>

                          <button
                            type="button"
                            disabled={updatingShowId === s.id}
                            onClick={() => handleDeleteShow(s)}
                            style={styles.deleteShowButton}
                          >
                            {updatingShowId === s.id ? "..." : "🗑️ Delete"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingShowId === s.id}
                          onClick={() => handleToggleShowStatus(s, "ended")}
                          style={styles.endShowButton}
                        >
                          {updatingShowId === s.id ? "Updating..." : "⏹ End Show"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : subView === "creators" ? (
        /* SUB-VIEW B: CREATORS DIRECTORY */
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Registered Creators &amp; Creator IDs</h3>
              <p>
                Copy a Creator&apos;s ID to link new Shows directly to their Creator workspace.
              </p>
            </div>
          </div>

          {loadingCreators ? (
            <p style={{ color: "#64748b" }}>Loading creators...</p>
          ) : creators.length === 0 ? (
            <div style={styles.emptyBox}>
              <strong>No Creators registered yet.</strong>
              <span>
                Creators can register from the login screen using the &ldquo;Register as Creator / Agency&rdquo; button.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {creators.map((c) => {
                const linkedShows = shows.filter(
                  (s) =>
                    (s.creator_id || "").toUpperCase() ===
                    (c.show_id || "").toUpperCase()
                );
                return (
                  <div key={c.id} style={styles.creatorRow}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "15px", color: "#0f172a" }}>
                          {c.full_name}
                        </strong>
                        <span style={styles.creatorIdPill}>
                          Creator ID: {c.show_id || "—"}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                        {c.email} · Linked Shows: <strong>{linkedShows.length}</strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCreatorIdInput(c.show_id || "");
                        onNavigate("create-show");
                      }}
                      className="secondary-button"
                      style={{ fontSize: "12px" }}
                    >
                      + Assign Show to {c.show_id}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* SUB-VIEW C: ACTIVE SHOWS & EPISODES QUEUE */
        <div style={styles.showsLayout}>
          <div className="panel">
            <div className="panel-heading" style={{ marginBottom: "12px" }}>
              <div>
                <h3>Active Shows ({activeShows.length})</h3>
                <p>Select a show to view its episodes.</p>
              </div>
            </div>

            {activeShows.length === 0 ? (
              <div style={styles.emptyBox}>
                <strong>No active shows right now.</strong>
                <span>
                  Click <strong>+ Create New Show</strong> or reopen an ended show from <strong>Manage Shows</strong>.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeShows.map((s) => {
                  const isSelected = s.id === selectedShowId;
                  const pendingCount = pendingByShow[s.id] || 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedShowId(s.id);
                        setEpisodeFilter("");
                      }}
                      style={{
                        ...styles.showListItem,
                        borderColor: isSelected ? "#1e3a8a" : "#e2e8f0",
                        backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                      }}
                    >
                      <div style={{ textAlign: "left", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                          <strong style={{ fontSize: "15px", color: "#0f172a" }}>
                            {s.show_name}
                          </strong>
                          {pendingCount > 0 && (
                            <span style={styles.pendingAlertBadge}>
                              {pendingCount} Pending
                            </span>
                          )}
                        </div>
                        <span style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
                          Creator ID: <strong>{s.creator_id || "—"}</strong> · Show Code:{" "}
                          {s.show_id}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel">
            {!selectedShow ? (
              <div style={styles.emptyBox}>
                <strong>Select a Show on the left to inspect its episodes.</strong>
              </div>
            ) : (
              <>
                <div className="panel-heading">
                  <div>
                    <h3>{selectedShow.show_name} — Episodes ({episodes.length})</h3>
                    <p>
                      Linked Creator ID: <strong>{selectedShow.creator_id || "—"}</strong> · Click any submitted episode to open it in QC Studio.
                    </p>
                  </div>

                  {/* COMPACT EPISODE # SEARCH (HANDLES 200+ EPISODES) */}
                  {episodes.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={episodeFilter}
                        onChange={(e) => setEpisodeFilter(e.target.value)}
                        placeholder="Search Ep # (e.g. 200)"
                        style={styles.epSearchInput}
                      />
                      {episodeFilter && (
                        <button
                          type="button"
                          onClick={() => setEpisodeFilter("")}
                          className="secondary-button"
                          style={{ padding: "6px 10px", fontSize: "12px" }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {loadingEpisodes ? (
                  <p style={{ color: "#64748b" }}>Loading episodes...</p>
                ) : filteredEpisodes.length === 0 ? (
                  <div style={styles.emptyBox}>
                    <strong>
                      {episodeFilter
                        ? `No episode matching "${episodeFilter}"`
                        : "No episodes found for this show yet."}
                    </strong>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {filteredEpisodes.map((ep) => {
                      const hasVideo = Boolean(ep.drive_file_id);
                      const badgeStyle = getEpisodeBadgeStyle(ep.status);
                      return (
                        <div key={ep.id} style={styles.episodeRow}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={styles.epNumberPill}>
                                Ep {ep.episode_number}
                              </span>
                              <strong style={{ fontSize: "15px", color: "#0f172a" }}>
                                {ep.ep_name || `Episode ${ep.episode_number}`}
                              </strong>
                              <span
                                style={{
                                  ...badgeStyle,
                                  padding: "3px 10px",
                                  borderRadius: "999px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                }}
                              >
                                {ep.status}
                              </span>
                            </div>
                            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                              {hasVideo
                                ? "Google Drive video submitted — ready for QC review"
                                : "Waiting for Creator to upload Google Drive link"}
                              {ep.reviewed_by ? ` · Last reviewed by ${ep.reviewed_by}` : ""}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={!hasVideo}
                            onClick={() => onOpenEpisodeInStudio(selectedShow, ep)}
                            className={hasVideo ? "primary-button" : "secondary-button"}
                            style={{ fontSize: "13px" }}
                          >
                            {hasVideo ? "▶ Open in QC Studio" : "No Video Yet"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  portalWrap: {
    maxWidth: "1240px",
    margin: "0 auto",
    padding: "20px",
    width: "100%",
    boxSizing: "border-box",
  },
  heroHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
  },
  rolePill: {
    display: "inline-block",
    backgroundColor: "#e0e7ff",
    color: "#1e3a8a",
    fontSize: "11px",
    fontWeight: "800",
    padding: "4px 10px",
    borderRadius: "999px",
    letterSpacing: "0.5px",
  },
  heroTitle: {
    margin: "10px 0 4px",
    fontSize: "24px",
    color: "#0f172a",
  },
  heroSub: {
    margin: 0,
    fontSize: "14px",
    color: "#64748b",
  },
  cardsGrid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  navCard: {
    backgroundColor: "#ffffff",
    border: "1.5px solid #e2e8f0",
    borderRadius: "14px",
    padding: "20px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px",
  },
  cardIconBox: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
  },
  cardArrow: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#1e3a8a",
  },
  cardTitle: {
    margin: 0,
    fontSize: "17px",
    color: "#0f172a",
  },
  cardDesc: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
    lineHeight: 1.45,
  },
  pendingAlertBadge: {
    backgroundColor: "#dc2626",
    color: "#ffffff",
    padding: "3px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "800",
    whiteSpace: "nowrap",
  },
  pendingMiniPill: {
    backgroundColor: "#dc2626",
    color: "#ffffff",
    padding: "1px 7px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "800",
  },
  subTabActive: {
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    border: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
  },
  subTabInactive: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid #e2e8f0",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
  },
  filterPillActive: {
    backgroundColor: "#0f172a",
    color: "#ffffff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  filterPillInactive: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
    padding: "6px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  manageShowRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderRadius: "10px",
    border: "1.5px solid #e2e8f0",
    flexWrap: "wrap",
    gap: "12px",
  },
  activeStatusPill: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    padding: "2px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "800",
  },
  endedStatusPill: {
    backgroundColor: "#e2e8f0",
    color: "#475569",
    padding: "2px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "800",
  },
  endShowButton: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fca5a5",
    padding: "7px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  deleteShowButton: {
    backgroundColor: "#dc2626",
    color: "#ffffff",
    border: "none",
    padding: "7px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  epSearchInput: {
    width: "160px",
    padding: "7px 11px",
    borderRadius: "8px",
    border: "1.5px solid #cbd5e1",
    fontSize: "13px",
    backgroundColor: "#ffffff",
  },
  successBanner: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#166534",
    padding: "12px 14px",
    borderRadius: "8px",
    marginBottom: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "13px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: "#334155",
    marginBottom: "5px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  twoColFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  helperText: {
    display: "block",
    fontSize: "11px",
    color: "#64748b",
    marginTop: "4px",
  },
  dateInput: {
    padding: "7px 11px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    fontWeight: "600",
    backgroundColor: "#ffffff",
  },
  emptyBox: {
    padding: "28px 20px",
    textAlign: "center",
    backgroundColor: "#f8fafc",
    borderRadius: "10px",
    border: "1px dashed #cbd5e1",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#475569",
    fontSize: "14px",
  },
  calendarEntryCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
    gap: "12px",
  },
  showTag: {
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    padding: "3px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
  },
  creatorTag: {
    backgroundColor: "#e0e7ff",
    color: "#1e3a8a",
    padding: "3px 9px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
  },
  showsLayout: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "18px",
    alignItems: "start",
  },
  showListItem: {
    display: "flex",
    alignItems: "center",
    padding: "13px 14px",
    borderRadius: "10px",
    border: "1.5px solid #e2e8f0",
    cursor: "pointer",
    width: "100%",
  },
  episodeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 15px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
    gap: "10px",
  },
  epNumberPill: {
    backgroundColor: "#0f172a",
    color: "#ffffff",
    padding: "3px 9px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
  },
  creatorRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 15px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
    gap: "10px",
  },
  creatorIdPill: {
    backgroundColor: "#e0e7ff",
    color: "#1e3a8a",
    padding: "2px 9px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "800",
  },
};