import React, { useCallback, useEffect, useRef, useState } from "react";
import ReferenceOverlay from "./ReferenceOverlay";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import CreatorDashboard from "./components/CreatorDashboard";
import AdminOverview from "./components/AdminOverview";
import ShowCalendarManager from "./components/ShowCalendarManager";
import QcstarPortal from "./components/QcstarPortal";
import { supabase } from "./supabaseClient";
import "./App.css";

const DEFAULT_OVERLAY_URL = "/default-overlay.png";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // Stay logged in for 30 days

function getSavedSessionUser() {
  try {
    const saved = localStorage.getItem("gyanqc_user");
    const expiry = Number(localStorage.getItem("gyanqc_user_expiry") || 0);
    if (!saved) return null;
    if (expiry && Date.now() > expiry) {
      localStorage.removeItem("gyanqc_user");
      localStorage.removeItem("gyanqc_user_expiry");
      return null;
    }
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getSavedSessionUser());
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminView, setAdminView] = useState("overview"); // 'overview' | 'qc' | 'calendar'

  // QCstar navigation history with Undo + Redo support (includes 'creators' view)
  const [qcstarNav, setQcstarNav] = useState({
    past: [],
    current: "home",
    future: [],
  });
  const qcstarView = qcstarNav.current;

  const navigateQcstar = useCallback((nextView) => {
    setQcstarNav((prev) => {
      if (prev.current === nextView) return prev;
      return {
        past: [...prev.past, prev.current],
        current: nextView,
        future: [],
      };
    });
  }, []);

  const goHomeQcstar = useCallback(() => {
    setQcstarNav((prev) => {
      if (prev.current === "home") return prev;
      return {
        past: [...prev.past, prev.current],
        current: "home",
        future: [],
      };
    });
  }, []);

  // Shows & Episodes State for QCstar / Admin
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [showEpisodes, setShowEpisodes] = useState([]);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [savingReview, setSavingReview] = useState(false);

  // Create Show Modal State (for Admin quick button)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newShowName, setNewShowName] = useState("");
  const [newAgencyName, setNewAgencyName] = useState("");
  const [newCreatorName, setNewCreatorName] = useState("");
  const [newShowId, setNewShowId] = useState("");
  const [creatingShow, setCreatingShow] = useState(false);

  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const videoInputRef = useRef(null);
  const lastSecondRef = useRef(-1);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveError, setDriveError] = useState("");
  const [isBuffering, setIsBuffering] = useState(false);

  const [overlayVisible, setOverlayVisible] = useState(true);

  const [currentTime, setCurrentTime] = useState(0);
  const [comment, setComment] = useState("");

  // Feedback state with Undo / Redo stacks
  const [feedbackHistory, setFeedbackHistory] = useState({
    past: [],
    present: [],
    future: [],
  });
  const feedback = feedbackHistory.present;

  const setFeedbackWithHistory = useCallback((updater) => {
    setFeedbackHistory((prev) => {
      const nextPresent =
        typeof updater === "function" ? updater(prev.present) : updater;
      if (nextPresent === prev.present) return prev;
      return {
        past: [...prev.past, prev.present],
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  const resetFeedbackHistory = useCallback((initialItems = []) => {
    setFeedbackHistory({
      past: [],
      present: initialItems,
      future: [],
    });
  }, []);

  const [status, setStatus] = useState("Pending");
  const [copied, setCopied] = useState(false);

  // Unified Undo & Redo handlers
  const canUndo =
    (qcstarView === "studio" && feedbackHistory.past.length > 0) ||
    qcstarNav.past.length > 0;

  const canRedo =
    (qcstarView === "studio" && feedbackHistory.future.length > 0) ||
    qcstarNav.future.length > 0;

  const handleUndo = useCallback(() => {
    if (qcstarView === "studio" && feedbackHistory.past.length > 0) {
      setFeedbackHistory((prev) => {
        const previous = prev.past[prev.past.length - 1];
        const newPast = prev.past.slice(0, -1);
        return {
          past: newPast,
          present: previous,
          future: [prev.present, ...prev.future],
        };
      });
      return;
    }

    setQcstarNav((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        current: previous,
        future: [prev.current, ...prev.future],
      };
    });
  }, [qcstarView, feedbackHistory.past.length]);

  const handleRedo = useCallback(() => {
    if (qcstarView === "studio" && feedbackHistory.future.length > 0) {
      setFeedbackHistory((prev) => {
        const next = prev.future[0];
        const newFuture = prev.future.slice(1);
        return {
          past: [...prev.past, prev.present],
          present: next,
          future: newFuture,
        };
      });
      return;
    }

    setQcstarNav((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.current],
        current: next,
        future: newFuture,
      };
    });
  }, [qcstarView, feedbackHistory.future.length]);

  // Global Keyboard Shortcuts: Ctrl+Z (Undo) and Ctrl+Shift+Z / Ctrl+Y (Redo)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.key.toLowerCase() === "z" && e.shiftKey) ||
        e.key.toLowerCase() === "y"
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

  // Silent background verification: never logs out on network hiccups, only if explicitly revoked
  useEffect(() => {
    if (!currentUser || currentUser.role === "creator") return;

    supabase
      .from("qc_users")
      .select("*")
      .eq("email", currentUser.email)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        if (data.status !== "approved") {
          handleLogout();
        } else {
          setCurrentUser(data);
          localStorage.setItem("gyanqc_user", JSON.stringify(data));
          localStorage.setItem(
            "gyanqc_user_expiry",
            String(Date.now() + SESSION_DURATION_MS)
          );
        }
      });
  }, []);

  const fetchShows = async () => {
    const { data } = await supabase
      .from("qc_shows")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setShows(data);
      if (data.length > 0 && !selectedShow) {
        setSelectedShow(data[0]);
      }
    }
  };

  // Fetch episodes sorted descending so newest / highest episode numbers appear at the top
  const fetchEpisodesForShow = async (showUuid) => {
    if (!showUuid) return;
    const { data } = await supabase
      .from("qc_episodes")
      .select("*")
      .eq("show_uuid", showUuid)
      .order("episode_number", { ascending: false });

    if (data) setShowEpisodes(data);
  };

  useEffect(() => {
    if (currentUser && (currentUser.role === "qcstar" || currentUser.role === "admin")) {
      fetchShows();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedShow?.id) {
      fetchEpisodesForShow(selectedShow.id);
    }
  }, [selectedShow]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setQcstarNav({ past: [], current: "home", future: [] });
    localStorage.setItem("gyanqc_user", JSON.stringify(user));
    localStorage.setItem(
      "gyanqc_user_expiry",
      String(Date.now() + SESSION_DURATION_MS)
    );
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setShowAdminPanel(false);
    setSelectedShow(null);
    setActiveEpisode(null);
    setQcstarNav({ past: [], current: "home", future: [] });
    localStorage.removeItem("gyanqc_user");
    localStorage.removeItem("gyanqc_user_expiry");
  };

  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const handleCreateShow = async (e) => {
    e.preventDefault();
    setCreatingShow(true);

    const { data: createdShow, error } = await supabase
      .from("qc_shows")
      .insert([
        {
          show_name: newShowName.trim(),
          agency_name: newAgencyName.trim(),
          creator_name: newCreatorName.trim(),
          show_id: newShowId.trim(),
          created_by_email: currentUser.email,
          created_by_name: currentUser.full_name,
        },
      ])
      .select("*")
      .single();

    if (error) {
      alert("Error creating Show: " + error.message);
      setCreatingShow(false);
      return;
    }

    const initialEps = [5, 4, 3, 2, 1].map((num) => ({
      show_uuid: createdShow.id,
      episode_number: num,
      ep_name: "",
      drive_url: "",
      drive_file_id: "",
      scheduled_date: null,
      status: "Not Submitted",
      feedback: [],
    }));
    await supabase.from("qc_episodes").insert(initialEps);

    setCreatingShow(false);
    setShowCreateModal(false);
    setNewShowName("");
    setNewAgencyName("");
    setNewCreatorName("");
    setNewShowId("");

    await fetchShows();
    setSelectedShow(createdShow);
    if (currentUser.role === "admin") setAdminView("qc");
  };

  const loadEpisodeIntoPlayer = (ep) => {
    if (!ep.drive_file_id) {
      alert("The Creator/Agency has not submitted a video link for this episode yet.");
      return;
    }
    setDriveError("");
    setIsBuffering(true);
    lastSecondRef.current = -1;
    setActiveEpisode(ep);
    setVideoUrl(`/api/drive-video?id=${ep.drive_file_id}`);
    setVideoName(`Ep ${ep.episode_number}: ${ep.ep_name || "Untitled"}`);
    setCurrentTime(0);
    resetFeedbackHistory(Array.isArray(ep.feedback) ? ep.feedback : []);
    setStatus(ep.status === "Not Submitted" ? "Pending" : ep.status);
  };

  const handleVideoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    setActiveEpisode(null);
    setDriveError("");
    setIsBuffering(false);
    lastSecondRef.current = -1;
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setCurrentTime(0);
    resetFeedbackHistory([]);
    setStatus("Pending");
    event.target.value = "";
  };

  const handleDriveLinkLoad = (event) => {
    event.preventDefault();
    setDriveError("");

    const trimmed = driveUrl.trim();
    const match =
      trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (!match || !match[1]) {
      setDriveError("Invalid link. Paste a valid Google Drive file link.");
      return;
    }

    const fileId = match[1];
    setActiveEpisode(null);
    setIsBuffering(true);
    lastSecondRef.current = -1;
    setVideoUrl(`/api/drive-video?id=${fileId}`);
    setVideoName(`Google Drive Video (${fileId.slice(0, 6)}...)`);
    setCurrentTime(0);
    resetFeedbackHistory([]);
    setStatus("Pending");
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  };

  const handleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen({ navigationUI: "hide" });
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  const addFeedback = () => {
    const message = comment.trim();
    if (!message || !videoUrl) return;

    setFeedbackWithHistory((previous) => [
      ...previous,
      {
        id: Date.now(),
        time: videoRef.current ? videoRef.current.currentTime : currentTime,
        message,
      },
    ]);

    setComment("");
  };

  const handleSaveDecision = async (newStatus) => {
    setStatus(newStatus);
    if (!activeEpisode) return;

    setSavingReview(true);
    const { error } = await supabase
      .from("qc_episodes")
      .update({
        status: newStatus,
        feedback,
        reviewed_by: currentUser.full_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeEpisode.id);

    setSavingReview(false);
    if (!error) {
      if (selectedShow?.id) {
        fetchEpisodesForShow(selectedShow.id);
      }
      alert(`Saved! Ep ${activeEpisode.episode_number} marked as "${newStatus}".`);
    }
  };

  const handleCopyFeedback = async () => {
    if (feedback.length === 0) return;

    const sortedItems = feedback
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((item) => `[${formatTime(item.time)}] ${item.message}`)
      .join("\n");

    const showInfo =
      activeEpisode && selectedShow ? `Show: ${selectedShow.show_name} | ` : "";
    const textToCopy = `GyanQC Feedback - ${showInfo}${videoName || "Video"}\nReviewed by: ${currentUser.full_name}\nStatus: ${status}\n\n${sortedItems}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const jumpToTime = (time) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    lastSecondRef.current = Math.floor(time);
    setCurrentTime(time);
    videoRef.current.play().catch(() => {});
  };

  const isMonthlyPlannerPage =
    (currentUser.role === "qcstar" && qcstarView === "monthly-planner") ||
    (currentUser.role === "admin" && adminView === "calendar");

  // Pending episodes for the active show (sorted descending so newest episodes appear at top)
  const pendingShowEpisodes = showEpisodes.filter(
    (ep) => ep.status !== "Approved" && ep.status !== "Not Submitted"
  );

  return (
    <main className="qc-app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">G</div>
          <div>
            <h2>GyanQC</h2>
            <span>
              {currentUser.role === "creator"
                ? `Creator Portal · Show ID ${currentUser.show_id || currentUser.show?.show_id}`
                : currentUser.role === "qcstar"
                ? "QCstar Workspace"
                : "Operations Command Center"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Global Undo, Redo + Home Buttons for QCstar */}
          {currentUser.role === "qcstar" && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="secondary-button"
                style={{
                  fontWeight: "700",
                  padding: "7px 12px",
                  fontSize: "13px",
                  opacity: canUndo ? 1 : 0.45,
                }}
              >
                ↶ Undo
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="secondary-button"
                style={{
                  fontWeight: "700",
                  padding: "7px 12px",
                  fontSize: "13px",
                  opacity: canRedo ? 1 : 0.45,
                }}
              >
                ↷ Redo
              </button>

              {qcstarView !== "home" && (
                <button
                  type="button"
                  onClick={goHomeQcstar}
                  style={{
                    backgroundColor: "#1e3a8a",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  🏠 Home
                </button>
              )}
            </>
          )}

          {/* Admin Top Navigation */}
          {currentUser.role === "admin" && (
            <>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: "#16a34a",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                + Create Show
              </button>

              <button
                type="button"
                onClick={() => setAdminView("calendar")}
                className="secondary-button"
                style={{
                  backgroundColor: adminView === "calendar" ? "#dbeafe" : undefined,
                  color: adminView === "calendar" ? "#1e3a8a" : undefined,
                  fontWeight: "700",
                }}
              >
                📅 Monthly Calendar
              </button>

              <button
                type="button"
                onClick={() => setAdminView("overview")}
                className="secondary-button"
                style={{
                  backgroundColor: adminView === "overview" ? "#e0e7ff" : undefined,
                  color: adminView === "overview" ? "#1e3a8a" : undefined,
                  fontWeight: "600",
                }}
              >
                All Shows Overview
              </button>
              <button
                type="button"
                onClick={() => setAdminView("qc")}
                className="secondary-button"
                style={{
                  backgroundColor: adminView === "qc" ? "#e0e7ff" : undefined,
                  color: adminView === "qc" ? "#1e3a8a" : undefined,
                  fontWeight: "600",
                }}
              >
                QCstar Studio
              </button>
              <button
                type="button"
                onClick={() => setShowAdminPanel(true)}
                style={{
                  backgroundColor: "#1e3a8a",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Team & Approvals
              </button>
            </>
          )}

          <div className="workspace-status">
            <span className="status-dot"></span>
            {currentUser.full_name}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="secondary-button"
            style={{ padding: "6px 12px", fontSize: "13px" }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Create Show Modal (Admin) */}
      {showCreateModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>Create New Show</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                  Show ID (POC Phone Number) will be the Creator/Agency login credential.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={modalStyles.closeBtn}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShow} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={modalStyles.label}>Show Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Crime Patrol Stories"
                  value={newShowName}
                  onChange={(e) => setNewShowName(e.target.value)}
                  style={modalStyles.input}
                />
              </div>

              <div>
                <label style={modalStyles.label}>Agency Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Red Chillies Digital"
                  value={newAgencyName}
                  onChange={(e) => setNewAgencyName(e.target.value)}
                  style={modalStyles.input}
                />
              </div>

              <div>
                <label style={modalStyles.label}>Creator Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Mehta"
                  value={newCreatorName}
                  onChange={(e) => setNewCreatorName(e.target.value)}
                  style={modalStyles.input}
                />
              </div>

              <div>
                <label style={modalStyles.label}>Show ID (POC Phone Number) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210"
                  value={newShowId}
                  onChange={(e) => setNewShowId(e.target.value)}
                  style={modalStyles.input}
                />
              </div>

              <button type="submit" disabled={creatingShow} className="primary-button" style={{ marginTop: "6px" }}>
                {creatingShow ? "Creating Show..." : "Create Show & Generate Login Credentials"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* INTERFACE 1: CREATOR / AGENCY PORTAL */}
      {currentUser.role === "creator" ? (
        <CreatorDashboard currentUser={currentUser} show={currentUser.show} />
      ) : isMonthlyPlannerPage ? (
        /* FULL-PAGE MONTHLY CALENDAR PLANNER */
        <ShowCalendarManager
          shows={shows}
          selectedShow={selectedShow}
          onSelectShow={(s) => setSelectedShow(s)}
          currentUser={currentUser}
          onBackToStudio={() => {
            if (currentUser.role === "admin") setAdminView("qc");
            else handleUndo();
          }}
        />
      ) : currentUser.role === "qcstar" && qcstarView !== "studio" ? (
        /* QCSTAR HOME & TABS */
        <QcstarPortal
          activeTab={qcstarView === "creators" ? "shows" : qcstarView}
          isCreatorsView={qcstarView === "creators"}
          onNavigate={(nextTab) => {
            if (nextTab === "studio") {
              setActiveEpisode(null);
              setVideoUrl("");
              setVideoName("");
              setDriveUrl("");
              setDriveError("");
              resetFeedbackHistory([]);
              setStatus("Pending");
            }
            navigateQcstar(nextTab);
          }}
          shows={shows}
          currentUser={currentUser}
          onShowCreated={async (createdShow) => {
            await fetchShows();
            setSelectedShow(createdShow);
            navigateQcstar("shows");
          }}
          onShowEnded={async () => {
            await fetchShows();
          }}
          onOpenEpisodeInStudio={(showObj, epObj) => {
            setSelectedShow(showObj);
            fetchEpisodesForShow(showObj.id);
            navigateQcstar("studio");
            setTimeout(() => loadEpisodeIntoPlayer(epObj), 100);
          }}
          onOpenMonthlyPlanner={() => navigateQcstar("monthly-planner")}
        />
      ) : currentUser.role === "admin" && adminView === "overview" ? (
        /* INTERFACE 2: ADMIN OVERVIEW */
        <AdminOverview
          onOpenShowInQC={(showObj) => {
            setSelectedShow(showObj);
            setAdminView("qc");
          }}
          onOpenTeam={() => setShowAdminPanel(true)}
        />
      ) : (
        /* INTERFACE 3: QC STUDIO */
        <div className="qc-workspace">
          <section className="video-column">
            <div className="panel video-panel">
              <div className="panel-heading">
                <div>
                  <h3>Video Review</h3>
                  <p>
                    {activeEpisode && selectedShow
                      ? `Show: ${selectedShow.show_name} (${selectedShow.agency_name})`
                      : "Upload any local video or paste a Google Drive link for quick QC."}
                  </p>
                </div>

                <span
                  className={`review-status ${status
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >
                  {status}
                </span>
              </div>

              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={handleVideoUpload}
              />

              <div ref={stageRef} className="video-stage">
                {videoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      className="review-video"
                      src={videoUrl}
                      preload="auto"
                      controls
                      playsInline
                      controlsList="nofullscreen noremoteplayback"
                      disablePictureInPicture
                      style={{
                        transform: "translateZ(0)",
                        willChange: "transform",
                      }}
                      onWaiting={() => setIsBuffering(true)}
                      onCanPlay={() => setIsBuffering(false)}
                      onPlaying={() => setIsBuffering(false)}
                      onTimeUpdate={() => {
                        const t = videoRef.current?.currentTime || 0;
                        const wholeSecond = Math.floor(t);
                        if (wholeSecond !== lastSecondRef.current) {
                          lastSecondRef.current = wholeSecond;
                          setCurrentTime(t);
                        }
                      }}
                      onError={() => {
                        setIsBuffering(false);
                        if (videoUrl.startsWith("/api/drive-video")) {
                          setDriveError(
                            "Could not stream video. Make sure the Google Drive file is shared as 'Anyone with the link'."
                          );
                        }
                      }}
                    />

                    <div style={{ pointerEvents: "none" }}>
                      <ReferenceOverlay
                        src={DEFAULT_OVERLAY_URL}
                        visible={overlayVisible}
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
                      onClick={handleFullscreen}
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
                      onClick={() => videoInputRef.current?.click()}
                      type="button"
                    >
                      <span className="upload-icon">▶</span>
                      <strong>Upload Local Video</strong>
                      <span>Check framing & safe zones on any video file</span>
                      <span className="upload-format">MP4, MOV, WEBM</span>
                    </button>

                    <form
                      className="drive-link-form"
                      onSubmit={handleDriveLinkLoad}
                    >
                      <span className="drive-divider">
                        OR PASTE GOOGLE DRIVE LINK
                      </span>
                      <div className="drive-input-group">
                        <input
                          type="url"
                          placeholder="https://drive.google.com/file/d/..."
                          value={driveUrl}
                          onChange={(e) => setDriveUrl(e.target.value)}
                          required
                        />
                        <button type="submit">Load</button>
                      </div>
                      {driveError && (
                        <span className="drive-error">{driveError}</span>
                      )}
                    </form>
                  </div>
                )}
              </div>

              <div className="video-information">
                <div>
                  <strong>{videoName || "No video loaded"}</strong>
                  <span>
                    {videoUrl
                      ? isBuffering
                        ? "Buffering video stream..."
                        : "Ready for quality review"
                      : "Upload a local video or paste a Drive link above"}
                  </span>
                </div>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setActiveEpisode(null);
                    setVideoUrl("");
                    setVideoName("");
                    setDriveUrl("");
                    setDriveError("");
                    setIsBuffering(false);
                    setCurrentTime(0);
                  }}
                >
                  {videoUrl ? "Change Video" : "Clear"}
                </button>
              </div>
            </div>
          </section>

          <section className="right-column">
            {/* Shown ONLY when navigated from Shows/Calendar: Pending Episodes in this Show (Newest First) */}
            {activeEpisode && selectedShow && (
              <div className="panel">
                <div className="panel-heading" style={{ marginBottom: "10px" }}>
                  <div>
                    <h3>{selectedShow.show_name} — Pending Episodes (Latest First)</h3>
                    <p>Switch between pending episodes in this Show.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchEpisodesForShow(selectedShow.id)}
                    className="secondary-button"
                    style={{ padding: "5px 10px", fontSize: "12px" }}
                  >
                    ↻ Refresh
                  </button>
                </div>

                {pendingShowEpisodes.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#15803d", margin: 0, fontWeight: "600" }}>
                    ✓ All submitted episodes for {selectedShow.show_name} have been approved!
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "190px", overflowY: "auto" }}>
                    {pendingShowEpisodes.map((ep) => (
                      <div
                        key={ep.id}
                        onClick={() => loadEpisodeIntoPlayer(ep)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          border: activeEpisode?.id === ep.id ? "2px solid #1e3a8a" : "1px solid #e2e8f0",
                          backgroundColor: activeEpisode?.id === ep.id ? "#eff6ff" : "#f8fafc",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "13px", display: "block", color: "#0f172a" }}>
                            Ep {ep.episode_number}: {ep.ep_name || "Untitled"}
                          </strong>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>
                            {ep.scheduled_date ? `Scheduled: ${ep.scheduled_date}` : "No date set"}
                          </span>
                        </div>
                        <span className={`review-status ${ep.status.toLowerCase().replace(" ", "-")}`}>
                          {ep.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="panel overlay-panel">
              <div className="panel-heading" style={{ marginBottom: 0 }}>
                <div>
                  <h3>Reference Image Overlay</h3>
                  <p>Default 9:16 safe-zone reference active.</p>
                </div>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setOverlayVisible((value) => !value)}
                >
                  {overlayVisible ? "Hide Overlay" : "Show Overlay"}
                </button>
              </div>
            </div>

            <div className="panel feedback-panel">
              <div className="panel-heading">
                <div>
                  <h3>QC Feedback</h3>
                  <p>Timestamp-based review comments.</p>
                </div>

                <span className="feedback-count">{feedback.length}</span>
              </div>

              <div className="feedback-form">
                <div className="current-time">
                  <span>Current Video Timestamp</span>
                  <strong>{formatTime(currentTime)}</strong>
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Describe what needs to be corrected..."
                  rows="3"
                />

                <button
                  className="primary-button add-feedback-button"
                  type="button"
                  onClick={addFeedback}
                  disabled={!videoUrl || !comment.trim()}
                >
                  + Add Feedback at Current Time
                </button>
              </div>

              <div className="timeline-heading">
                <h4>Feedback Timeline</h4>
                <div className="timeline-actions">
                  <span>{feedback.length} comments</span>
                  {feedback.length > 0 && (
                    <button
                      className="copy-feedback-button"
                      type="button"
                      onClick={handleCopyFeedback}
                    >
                      {copied ? "✓ Copied!" : "Copy Feedback"}
                    </button>
                  )}
                </div>
              </div>

              {feedback.length === 0 ? (
                <div className="empty-feedback">
                  <div className="empty-icon">◌</div>
                  <strong>No feedback yet.</strong>
                  <span>Your review comments will appear here.</span>
                </div>
              ) : (
                <div className="feedback-list">
                  {feedback
                    .slice()
                    .sort((a, b) => a.time - b.time)
                    .map((item) => (
                      <div className="feedback-item" key={item.id}>
                        <button
                          className="feedback-time"
                          type="button"
                          onClick={() => jumpToTime(item.time)}
                        >
                          {formatTime(item.time)}
                        </button>

                        <p>{item.message}</p>

                        <button
                          className="delete-feedback"
                          type="button"
                          onClick={() =>
                            setFeedbackWithHistory((previous) =>
                              previous.filter((f) => f.id !== item.id)
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              )}

              <div className="review-actions">
                <button
                  className="approve-button"
                  type="button"
                  disabled={!videoUrl || savingReview}
                  onClick={() => handleSaveDecision("Approved")}
                >
                  {savingReview ? "Saving..." : "✓ Approve Video"}
                </button>

                <button
                  className="request-button"
                  type="button"
                  disabled={!videoUrl || savingReview}
                  onClick={() => handleSaveDecision("Changes Requested")}
                >
                  {savingReview ? "Saving..." : "Request Changes"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <footer className="app-footer">
        GyanQC · Video Quality Control Operations
      </footer>
    </main>
  );
}

const modalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "460px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)",
  },
  closeBtn: {
    background: "#f1f5f9",
    border: "none",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
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
};