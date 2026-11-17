import React, { useEffect, useRef, useState } from "react";
import ReferenceOverlay from "./ReferenceOverlay";
import "./App.css";

const DEFAULT_OVERLAY_URL = "/default-overlay.png";

export default function App() {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const videoInputRef = useRef(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveError, setDriveError] = useState("");
  const [isDriveEmbed, setIsDriveEmbed] = useState(false);

  const [overlayVisible, setOverlayVisible] = useState(true);

  const [currentTime, setCurrentTime] = useState(0);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState([]);
  const [status, setStatus] = useState("Pending");
  const [copied, setCopied] = useState(false);

  const [waitingWorker, setWaitingWorker] = useState(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdateBanner(true);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdateBanner(true);
            }
          });
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  const handleAppUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  };

  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const handleVideoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    setDriveError("");
    setIsDriveEmbed(false);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setCurrentTime(0);
    setFeedback([]);
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
    setIsDriveEmbed(true);
    setVideoUrl(`https://drive.google.com/file/d/${fileId}/preview`);
    setVideoName(`Google Drive Video (${fileId.slice(0, 6)}...)`);
    setCurrentTime(0);
    setFeedback([]);
    setStatus("Pending");
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "00:00";

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  };

  const handleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen({
          navigationUI: "hide",
        });
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  const addFeedback = () => {
    const message = comment.trim();
    if (!message || !videoUrl) return;

    setFeedback((previous) => [
      ...previous,
      {
        id: Date.now(),
        time: videoRef.current ? videoRef.current.currentTime : currentTime,
        message,
      },
    ]);

    setComment("");
  };

  const handleCopyFeedback = async () => {
    if (feedback.length === 0) return;

    const sortedItems = feedback
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((item) => `[${formatTime(item.time)}] ${item.message}`)
      .join("\n");

    const textToCopy = `GyanQC Feedback - ${videoName || "Video"}\nStatus: ${status}\n\n${sortedItems}`;

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
    videoRef.current.play().catch(() => {});
  };

  return (
    <main className="qc-app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">G</div>
          <div>
            <h2>GyanQC</h2>
            <span>Video Quality Control</span>
          </div>
        </div>

        <div className="workspace-status">
          <span className="status-dot"></span>
          Local Workspace
        </div>
      </header>

      <div className="qc-workspace">
        <section className="video-column">
          <div className="panel video-panel">
            <div className="panel-heading">
              <div>
                <h3>Video Review</h3>
                <p>Upload and review your video content.</p>
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
                  {isDriveEmbed ? (
                    <iframe
                      className="review-video"
                      src={videoUrl}
                      title={videoName}
                      allow="autoplay; fullscreen"
                      style={{ border: "none", width: "100%", height: "100%" }}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      className="review-video"
                      src={videoUrl}
                      preload="auto"
                      controls
                      playsInline
                      controlsList="nofullscreen noremoteplayback"
                      disablePictureInPicture
                      onTimeUpdate={() =>
                        setCurrentTime(
                          videoRef.current?.currentTime || 0
                        )
                      }
                    />
                  )}

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
                    <strong>Upload Video</strong>
                    <span>Select a video to begin QC review</span>
                    <span className="upload-format">
                      MP4, MOV, WEBM
                    </span>
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
                <strong>{videoName || "No video selected"}</strong>
                <span>
                  {videoUrl
                    ? "Ready for quality review"
                    : "Upload your video or paste Drive link"}
                </span>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setVideoUrl("");
                  setVideoName("");
                  setDriveUrl("");
                  setIsDriveEmbed(false);
                }}
              >
                {videoUrl ? "Change Video" : "Choose Video"}
              </button>
            </div>
          </div>
        </section>

        <section className="right-column">
          <div className="panel overlay-panel">
            <div className="panel-heading" style={{ marginBottom: 0 }}>
              <div>
                <h3>Reference Image Overlay</h3>
                <p>Default 9:16 safe-zone reference active.</p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setOverlayVisible((value) => !value)
                }
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

              <span className="feedback-count">
                {feedback.length}
              </span>
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
                rows="4"
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
                          setFeedback((previous) =>
                            previous.filter(
                              (f) => f.id !== item.id
                            )
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
                disabled={!videoUrl}
                onClick={() => setStatus("Approved")}
              >
                ✓ Approve Video
              </button>

              <button
                className="request-button"
                type="button"
                disabled={!videoUrl}
                onClick={() => setStatus("Changes Requested")}
              >
                Request Changes
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="app-footer">
        GyanQC · Video Quality Control Workspace
      </footer>

      {showUpdateBanner && (
        <div className="update-banner">
          <span>New version of GyanQC is ready!</span>
          <div className="update-banner-actions">
            <button type="button" onClick={handleAppUpdate} className="update-now-btn">
              Update Now
            </button>
            <button
              type="button"
              onClick={() => setShowUpdateBanner(false)}
              className="update-later-btn"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </main>
  );
}