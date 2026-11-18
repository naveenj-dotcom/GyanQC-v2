import React, { useCallback, useEffect, useRef, useState } from "react";
import ReferenceOverlay from "./ReferenceOverlay";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import CreatorDashboard from "./components/CreatorDashboard";
import AdminOverview from "./components/AdminOverview";
import ShowCalendarManager from "./components/ShowCalendarManager";
import QcstarPortal from "./components/QcstarPortal";
import OverlaySettingsModal from "./components/OverlaySettingsModal";
import { supabase } from "./supabaseClient";
import "./App.css";

const DEFAULT_OVERLAY_URL = "/default-overlay.png";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const VIDEO_PROXY_URL = "https://gyanqc-video-proxy.naveenj.workers.dev";

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

function applyDocumentIcons(logoUrl) {
  const iconHref = logoUrl || "/favicon.svg";
  const appleHref = logoUrl || "/icon-192.png";

  const iconEl = document.querySelector("link[rel='icon']");
  if (iconEl) iconEl.href = iconHref;

  const appleEl = document.querySelector("link[rel='apple-touch-icon']");
  if (appleEl) appleEl.href = appleHref;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getSavedSessionUser());
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showOverlayModal, setShowOverlayModal] = useState(false);
  const [activeOverlayUrl, setActiveOverlayUrl] = useState(DEFAULT_OVERLAY_URL);
  const [appLogoUrl, setAppLogoUrl] = useState("");
  const [totalPendingCount, setTotalPendingCount] = useState(0);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onFocusIn = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        document.body.classList.add("keyboard-open");
      }
    };
    const onFocusOut = () => {
      setTimeout(() => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "select") {
          document.body.classList.remove("keyboard-open");
        }
      }, 120);
    };
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Unified QCstar + Admin navigation history
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

  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [showEpisodes, setShowEpisodes] = useState([]);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [epSearchQuery, setEpSearchQuery] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const videoInputRef = useRef(null);
  const lastSecondRef = useRef(-1);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveError, setDriveError] = useState("");
  const [activeDriveId, setActiveDriveId] = useState("");
  const [playbackMode, setPlaybackMode] = useState("adaptive"); // "adaptive" (instant low->HD) | "direct" (timestamp sync)
  const [isBuffering, setIsBuffering] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [comment, setComment] = useState("");

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

  const fetchGlobalSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("qc_settings")
      .select("key, value")
      .in("key", ["video_overlay_url", "app_logo_url"]);

    if (!error && Array.isArray(data)) {
      const overlayRow = data.find((r) => r.key === "video_overlay_url");
      const logoRow = data.find((r) => r.key === "app_logo_url");
      if (overlayRow?.value) setActiveOverlayUrl(overlayRow.value);
      if (logoRow) {
        const nextLogo = logoRow.value || "";
        setAppLogoUrl(nextLogo);
        applyDocumentIcons(nextLogo);
      }
    }
  }, []);

  useEffect(() => {
    fetchGlobalSettings();
  }, [fetchGlobalSettings]);

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

  // Background pre-warm previous & next episodes so ▲ / ▼ switching is smooth
  useEffect(() => {
    if (!activeEpisode || !Array.isArray(showEpisodes) || showEpisodes.length < 2) return;
    const submitted = [...showEpisodes]
      .filter((ep) => Boolean(ep.drive_file_id))
      .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));
    const idx = submitted.findIndex((ep) => ep.id === activeEpisode.id);
    if (idx === -1) return;

    const neighbors = [submitted[idx - 1], submitted[idx + 1]].filter(Boolean);
    const createdLinks = [];
    neighbors.forEach((ep) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "video";
      link.href = `${VIDEO_PROXY_URL}?id=${ep.drive_file_id}`;
      document.head.appendChild(link);
      createdLinks.push(link);
    });

    return () => {
      createdLinks.forEach((l) => l.remove());
    };
  }, [activeEpisode, showEpisodes]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
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

  const fetchTotalPending = async (showsList) => {
    const activeIds = (showsList || [])
      .filter((s) => s.status !== "ended")
      .map((s) => s.id);
    if (activeIds.length === 0) {
      setTotalPendingCount(0);
      return;
    }
    const { count } = await supabase
      .from("qc_episodes")
      .select("id", { count: "exact", head: true })
      .in("show_uuid", activeIds)
      .neq("status", "Approved")
      .neq("status", "Not Submitted");
    setTotalPendingCount(count || 0);
  };

  const fetchShows = async () => {
    const { data } = await supabase
      .from("qc_shows")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setShows(data);
      fetchTotalPending(data);
      if (data.length > 0 && !selectedShow) {
        setSelectedShow(data[0]);
      }
    }
  };

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
    setShowOverlayModal(false);
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
    return <Login onLoginSuccess={handleLoginSuccess} logoUrl={appLogoUrl} />;
  }

  const loadEpisodeIntoPlayer = (ep) => {
    if (!ep.drive_file_id) {
      alert("The Creator/Agency has not submitted a video link for this episode yet.");
      return;
    }
    setDriveError("");
    setIsBuffering(true);
    lastSecondRef.current = -1;
    setActiveEpisode(ep);
    setActiveDriveId(ep.drive_file_id);
    setPlaybackMode("adaptive");
    setVideoUrl(`${VIDEO_PROXY_URL}?id=${ep.drive_file_id}`);
    setVideoName(`Ep ${ep.episode_number}: ${ep.ep_name || "Untitled"}`);
    setCurrentTime(0);
    resetFeedbackHistory(Array.isArray(ep.feedback) ? ep.feedback : []);
    setStatus(ep.status === "Not Submitted" ? "Pending" : ep.status);
  };

  const submittedEpisodesAsc = [...showEpisodes]
    .filter((ep) => Boolean(ep.drive_file_id))
    .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));

  const currentSubmittedIdx = activeEpisode
    ? submittedEpisodesAsc.findIndex((ep) => ep.id === activeEpisode.id)
    : -1;

  const prevSubmittedEp =
    currentSubmittedIdx > 0 ? submittedEpisodesAsc[currentSubmittedIdx - 1] : null;

  const nextSubmittedEp =
    currentSubmittedIdx !== -1 && currentSubmittedIdx < submittedEpisodesAsc.length - 1
      ? submittedEpisodesAsc[currentSubmittedIdx + 1]
      : null;

  const handleEpisodeNumberSearch = (e) => {
    e.preventDefault();
    const q = epSearchQuery.trim().toLowerCase();
    if (!q) return;

    const exactNum = Number(q.replace(/^ep\s*/i, ""));
    const match =
      (!Number.isNaN(exactNum) &&
        showEpisodes.find((ep) => Number(ep.episode_number) === exactNum)) ||
      showEpisodes.find(
        (ep) =>
          String(ep.episode_number).includes(q) ||
          (ep.ep_name || "").toLowerCase().includes(q)
      );

    if (!match) {
      alert(`Episode "${epSearchQuery.trim()}" was not found in ${selectedShow?.show_name || "this Show"}.`);
      return;
    }

    if (!match.drive_file_id) {
      alert(`Ep ${match.episode_number} has no video link submitted yet.`);
      return;
    }

    loadEpisodeIntoPlayer(match);
    setEpSearchQuery("");
  };

  const handleVideoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    setActiveEpisode(null);
    setActiveDriveId("");
    setPlaybackMode("direct");
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
    setActiveDriveId(fileId);
    setPlaybackMode("adaptive");
    setIsBuffering(true);
    lastSecondRef.current = -1;
    setVideoUrl(`${VIDEO_PROXY_URL}?id=${fileId}`);
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

  const handleFeedbackFocus = () => {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const addFeedback = () => {
    const message = comment.trim();
    if (!message || !videoUrl) return;

    const exactTime = videoRef.current ? videoRef.current.currentTime : currentTime;

    setFeedbackWithHistory((previous) => [
      ...previous,
      {
        id: Date.now(),
        time: exactTime,
        message,
      },
    ]);

    setComment("");
  };

  const handleSaveDecision = async (newStatus) => {
    if (newStatus === "Approved" && feedback.length > 0) {
      alert("Cannot approve while feedback items exist. Delete all feedback items first, or click \"Request Changes\".");
      return;
    }
    if (newStatus === "Changes Requested" && feedback.length === 0) {
      alert("Add at least one feedback note before clicking \"Request Changes\".");
      return;
    }
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
      fetchTotalPending(shows);
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
    if (activeDriveId && playbackMode === "adaptive") {
      setPlaybackMode("direct");
      setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = time;
        lastSecondRef.current = Math.floor(time);
        setCurrentTime(time);
        videoRef.current.play().catch(() => {});
      }, 250);
      return;
    }
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    lastSecondRef.current = Math.floor(time);
    setCurrentTime(time);
    videoRef.current.play().catch(() => {});
  };

  const isStaff = currentUser.role === "qcstar" || currentUser.role === "admin";
  const isMonthlyPlannerPage = isStaff && qcstarView === "monthly-planner";

  const portalActiveTab =
    qcstarView === "creators" || qcstarView === "manage-shows"
      ? "shows"
      : qcstarView;

  const openStudioClean = () => {
    setActiveEpisode(null);
    setActiveDriveId("");
    setPlaybackMode("adaptive");
    setVideoUrl("");
    setVideoName("");
    setDriveUrl("");
    setDriveError("");
    setEpSearchQuery("");
    resetFeedbackHistory([]);
    setStatus("Pending");
    navigateQcstar("studio");
  };

  return (
    <main className="qc-app">
      <header className="app-header">
        <div className="brand">
          {appLogoUrl ? (
            <img
              src={appLogoUrl}
              alt="GyanQC Logo"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                objectFit: "contain",
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                padding: "2px",
              }}
            />
          ) : (
            <div className="brand-icon">G</div>
          )}
          <div>
            <h2>GyanQC</h2>
            <span>
              {currentUser.role === "creator"
                ? `Creator Portal · Show ID ${currentUser.show_id || currentUser.show?.show_id}`
                : currentUser.role === "admin"
                ? "Admin & QCstar Studio"
                : "QCstar Workspace"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {isStaff && (
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
                  className="desktop-only-nav"
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

          {currentUser.role === "admin" && (
            <>
              <button
                type="button"
                onClick={() => setShowOverlayModal(true)}
                className="secondary-button"
                style={{
                  backgroundColor: "#fef3c7",
                  borderColor: "#f59e0b",
                  color: "#92400e",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
              >
                🎨 Overlay &amp; Logo
              </button>

              <button
                type="button"
                onClick={() => navigateQcstar("admin-overview")}
                className="secondary-button desktop-only-nav"
                style={{
                  backgroundColor: qcstarView === "admin-overview" ? "#e0e7ff" : undefined,
                  color: qcstarView === "admin-overview" ? "#1e3a8a" : undefined,
                  fontWeight: "600",
                  fontSize: "13px",
                }}
              >
                📊 Shows Overview
              </button>

              <button
                type="button"
                onClick={() => setShowAdminPanel(true)}
                className="desktop-only-nav"
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
                👥 Team & Approvals
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

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {showOverlayModal && (
        <OverlaySettingsModal
          currentOverlayUrl={activeOverlayUrl}
          currentLogoUrl={appLogoUrl}
          onSavedOverlay={(newUrl) => setActiveOverlayUrl(newUrl)}
          onSavedLogo={(newLogo) => {
            setAppLogoUrl(newLogo);
            applyDocumentIcons(newLogo);
          }}
          onClose={() => setShowOverlayModal(false)}
        />
      )}

      {currentUser.role === "creator" ? (
        <CreatorDashboard
          currentUser={currentUser}
          show={currentUser.show}
          overlayUrl={activeOverlayUrl}
        />
      ) : isMonthlyPlannerPage ? (
        <ShowCalendarManager
          shows={shows}
          selectedShow={selectedShow}
          onSelectShow={(s) => setSelectedShow(s)}
          currentUser={currentUser}
          onBackToStudio={() => handleUndo()}
        />
      ) : currentUser.role === "admin" && qcstarView === "admin-overview" ? (
        <AdminOverview
          onOpenShowInQC={(showObj) => {
            setSelectedShow(showObj);
            navigateQcstar("studio");
          }}
          onOpenTeam={() => setShowAdminPanel(true)}
        />
      ) : isStaff && qcstarView !== "studio" ? (
        <QcstarPortal
          activeTab={portalActiveTab}
          subView={qcstarView}
          onNavigate={(nextTab) => {
            if (nextTab === "studio") {
              openStudioClean();
            } else {
              navigateQcstar(nextTab);
            }
          }}
          shows={shows}
          currentUser={currentUser}
          onShowCreated={async (createdShow) => {
            await fetchShows();
            setSelectedShow(createdShow);
            navigateQcstar("shows");
          }}
          onShowsUpdated={async () => {
            await fetchShows();
          }}
          onOpenEpisodeInStudio={(showObj, epObj) => {
            setSelectedShow(showObj);
            setEpSearchQuery("");
            fetchEpisodesForShow(showObj.id);
            navigateQcstar("studio");
            setTimeout(() => loadEpisodeIntoPlayer(epObj), 100);
          }}
          onOpenMonthlyPlanner={() => navigateQcstar("monthly-planner")}
        />
      ) : (
        <div className={`qc-workspace ${isMobile && videoUrl ? "studio-mobile-active" : ""}`}>
          {/* LEFT / TOP COLUMN: VIDEO PLAYER WITH COMPACT EPISODE # SEARCH */}
          <section className="video-column">
            <div className="panel video-panel">
              <div
                className="panel-heading"
                style={{
                  marginBottom: isMobile ? "8px" : "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: isMobile ? "wrap" : "nowrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    title={videoName || "Video Review"}
                    style={{
                      fontSize: isMobile ? "15px" : undefined,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {videoName || "Video Review"}
                  </h3>
                  {!isMobile && (
                    <p
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activeEpisode && selectedShow
                        ? `Show: ${selectedShow.show_name}`
                        : "Upload any local video or paste a Google Drive link for quick QC."}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                    marginLeft: "auto",
                  }}
                >
                  {/* Compact Jump-to-Episode # Search (handles 200+ episodes) */}
                  {selectedShow && showEpisodes.length > 0 && (
                    <form
                      onSubmit={handleEpisodeNumberSearch}
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <input
                        type="text"
                        inputMode="numeric"
                        value={epSearchQuery}
                        onChange={(e) => setEpSearchQuery(e.target.value)}
                        placeholder="Ep # (200)"
                        style={{
                          width: "84px",
                          height: "28px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12px",
                          backgroundColor: "#ffffff",
                        }}
                      />
                      <button
                        type="submit"
                        className="primary-button"
                        style={{
                          height: "28px",
                          padding: "0 9px",
                          fontSize: "11px",
                          borderRadius: "6px",
                        }}
                      >
                        🔍 Go
                      </button>

                      {activeEpisode && submittedEpisodesAsc.length > 1 && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <button
                            type="button"
                            disabled={!nextSubmittedEp}
                            onClick={() => nextSubmittedEp && loadEpisodeIntoPlayer(nextSubmittedEp)}
                            title={
                              nextSubmittedEp
                                ? `Next Episode (Ep ${nextSubmittedEp.episode_number})`
                                : "Already at latest episode"
                            }
                            className="secondary-button"
                            style={{
                              height: "28px",
                              width: "26px",
                              padding: 0,
                              fontSize: "11px",
                              fontWeight: "800",
                              borderRadius: "6px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: nextSubmittedEp ? 1 : 0.4,
                              cursor: nextSubmittedEp ? "pointer" : "not-allowed",
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={!prevSubmittedEp}
                            onClick={() => prevSubmittedEp && loadEpisodeIntoPlayer(prevSubmittedEp)}
                            title={
                              prevSubmittedEp
                                ? `Previous Episode (Ep ${prevSubmittedEp.episode_number})`
                                : "Already at first episode"
                            }
                            className="secondary-button"
                            style={{
                              height: "28px",
                              width: "26px",
                              padding: 0,
                              fontSize: "11px",
                              fontWeight: "800",
                              borderRadius: "6px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: prevSubmittedEp ? 1 : 0.4,
                              cursor: prevSubmittedEp ? "pointer" : "not-allowed",
                            }}
                          >
                            ▼
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  {activeDriveId && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setPlaybackMode((m) => (m === "adaptive" ? "direct" : "adaptive"))
                      }
                      title={
                        playbackMode === "adaptive"
                          ? "Instant Adaptive Stream (starts low quality, upgrades to HD in background). Click to switch to Frame-Exact timestamp player."
                          : "Frame-Exact Direct Player (for exact timestamp notes). Click to switch back to Instant Adaptive Stream."
                      }
                      style={{
                        padding: "4px 9px",
                        fontSize: "11px",
                        fontWeight: "700",
                        backgroundColor: playbackMode === "adaptive" ? "#ecfdf5" : "#eff6ff",
                        borderColor: playbackMode === "adaptive" ? "#6ee7b7" : "#93c5fd",
                        color: playbackMode === "adaptive" ? "#065f46" : "#1e3a8a",
                      }}
                    >
                      {playbackMode === "adaptive" ? "⚡ Fast Stream" : "🎯 Frame-Exact"}
                    </button>
                  )}

                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setOverlayVisible((value) => !value)}
                    style={{ padding: "4px 9px", fontSize: "11px" }}
                  >
                    {overlayVisible ? "Hide Overlay" : "Show Overlay"}
                  </button>

                  <span
                    className={`review-status ${status
                      .toLowerCase()
                      .replace(" ", "-")}`}
                    style={{
                      minWidth: "136px",
                      textAlign: "center",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  >
                    {status}
                  </span>
                </div>
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
                  <div
                    className="video-frame-wrapper"
                    style={
                      activeDriveId && playbackMode === "adaptive"
                        ? {
                            width: isMobile ? "calc(36vh * 9 / 16)" : "calc(68vh * 9 / 16)",
                            height: isMobile ? "36vh" : "68vh",
                            maxWidth: "100%",
                            margin: "0 auto",
                          }
                        : {
                            aspectRatio: "9 / 16",
                            maxHeight: isMobile ? "36vh" : "68vh",
                            margin: "0 auto",
                          }
                    }
                  >
                    {activeDriveId && playbackMode === "adaptive" ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          overflow: "hidden",
                          position: "relative",
                          backgroundColor: "#000000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <iframe
                          key={activeDriveId}
                          src={`https://drive.google.com/file/d/${activeDriveId}/preview`}
                          title={videoName || "Google Drive Video"}
                          allow="autoplay; fullscreen"
                          style={{
                            width: "104%",
                            height: "100%",
                            border: "none",
                            backgroundColor: "#000000",
                            display: "block",
                            flexShrink: 0,
                          }}
                          onLoad={() => setIsBuffering(false)}
                        />
                      </div>
                    ) : (
                      <video
                        ref={videoRef}
                        className="review-video"
                        src={videoUrl}
                        preload="metadata"
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
                          if (videoUrl.startsWith(VIDEO_PROXY_URL)) {
                            setDriveError(
                              "Could not stream video. Make sure the Google Drive file is shared as 'Anyone with the link'."
                            );
                          }
                        }}
                      />
                    )}

                    <div className="overlay-frame-layer">
                      <ReferenceOverlay
                        src={activeOverlayUrl}
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
                  </div>
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

              {/* MOBILE SPLIT-SCREEN INLINE FEEDBACK BAR (STAYS VISIBLE ABOVE KEYBOARD WITH VIDEO) */}
              {isMobile && videoUrl && (
                <div
                  style={{
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addFeedback();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: "#0f172a",
                        color: "#ffffff",
                        padding: "8px 9px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "800",
                        flexShrink: 0,
                      }}
                    >
                      {formatTime(currentTime)}
                    </span>

                    <input
                      type="text"
                      value={comment}
                      onFocus={handleFeedbackFocus}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Describe what needs to be corrected..."
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "38px",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "1.5px solid #93c5fd",
                        fontSize: "16px",
                        backgroundColor: "#ffffff",
                      }}
                    />

                    <button
                      type="submit"
                      disabled={!comment.trim()}
                      className="primary-button"
                      style={{
                        height: "38px",
                        padding: "0 14px",
                        fontSize: "13px",
                        fontWeight: "700",
                        flexShrink: 0,
                      }}
                    >
                      + Add
                    </button>
                  </form>
                </div>
              )}

              {!isMobile && (
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
              )}
            </div>
          </section>

          {/* RIGHT / BELOW VIDEO COLUMN: FEEDBACK BOX (DESKTOP) + TIMELINE & APPROVE/REJECT */}
          <section className="right-column">
            <div className="panel feedback-panel">
              {!isMobile && (
                <>
                  <div className="panel-heading">
                    <div>
                      <h3>QC Feedback</h3>
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
                      onFocus={handleFeedbackFocus}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Describe what needs to be corrected..."
                      rows="2"
                      style={{ fontSize: "16px" }}
                    />

                    <button
                      className="primary-button add-feedback-button"
                      type="button"
                      onClick={() => addFeedback()}
                      disabled={!videoUrl || !comment.trim()}
                    >
                      + Add Feedback at {formatTime(currentTime)}
                    </button>
                  </div>
                </>
              )}

              <div className="timeline-heading" style={{ marginTop: isMobile ? 0 : undefined }}>
                <h4>Feedback Timeline ({feedback.length})</h4>
                <div className="timeline-actions">
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
                  <span>Pause the video and add comments at the exact timestamp.</span>
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

              {feedback.length > 0 && (
                <p style={{ margin: "8px 0 4px", fontSize: "12px", color: "#b45309", fontWeight: "600" }}>
                  ⚠ Remove all feedback items to enable Approve, or click Request Changes.
                </p>
              )}

              <div className="review-actions">
                <button
                  className="approve-button"
                  type="button"
                  disabled={!videoUrl || savingReview || feedback.length > 0}
                  title={
                    feedback.length > 0
                      ? "Delete all feedback items before approving"
                      : "Approve Video"
                  }
                  style={{
                    opacity: !videoUrl || savingReview || feedback.length > 0 ? 0.45 : 1,
                    cursor:
                      !videoUrl || savingReview || feedback.length > 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={() => handleSaveDecision("Approved")}
                >
                  {savingReview ? "Saving..." : "✓ Approve Video"}
                </button>

                <button
                  className="request-button"
                  type="button"
                  disabled={!videoUrl || savingReview || feedback.length === 0}
                  title={
                    feedback.length === 0
                      ? "Add at least one feedback item before requesting changes"
                      : "Request Changes"
                  }
                  style={{
                    opacity: !videoUrl || savingReview || feedback.length === 0 ? 0.45 : 1,
                    cursor:
                      !videoUrl || savingReview || feedback.length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={() => handleSaveDecision("Changes Requested")}
                >
                  {savingReview ? "Saving..." : "Request Changes"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION FOR QCSTAR & ADMIN ON MOBILE */}
      {isStaff && (
        <nav className="mobile-bottom-nav" aria-label="Workspace navigation">
          <button
            type="button"
            onClick={goHomeQcstar}
            className={`mobile-bottom-btn ${qcstarView === "home" ? "active" : ""}`}
          >
            <span className="mobile-bottom-icon">🏠</span>
            <span className="mobile-bottom-label">Home</span>
          </button>

          <button
            type="button"
            onClick={() => navigateQcstar("calendar")}
            className={`mobile-bottom-btn ${qcstarView === "calendar" ? "active" : ""}`}
          >
            <span className="mobile-bottom-icon">📅</span>
            <span className="mobile-bottom-label">Calendar</span>
          </button>

          <button
            type="button"
            onClick={() => navigateQcstar("shows")}
            className={`mobile-bottom-btn ${portalActiveTab === "shows" ? "active" : ""}`}
          >
            {totalPendingCount > 0 && (
              <span className="mobile-bottom-badge">{totalPendingCount}</span>
            )}
            <span className="mobile-bottom-icon">🎬</span>
            <span className="mobile-bottom-label">Shows</span>
          </button>

          <button
            type="button"
            onClick={openStudioClean}
            className={`mobile-bottom-btn ${qcstarView === "studio" ? "active" : ""}`}
          >
            <span className="mobile-bottom-icon">▶️</span>
            <span className="mobile-bottom-label">Studio</span>
          </button>

          {currentUser.role === "admin" && (
            <>
              <button
                type="button"
                onClick={() => navigateQcstar("admin-overview")}
                className={`mobile-bottom-btn ${qcstarView === "admin-overview" ? "active" : ""}`}
              >
                <span className="mobile-bottom-icon">📊</span>
                <span className="mobile-bottom-label">Overview</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAdminPanel(true)}
                className={`mobile-bottom-btn ${showAdminPanel ? "active" : ""}`}
              >
                <span className="mobile-bottom-icon">👥</span>
                <span className="mobile-bottom-label">Team</span>
              </button>
            </>
          )}
        </nav>
      )}

      <footer className="app-footer">
        GyanQC · Video Quality Control Operations
      </footer>
    </main>
  );
}