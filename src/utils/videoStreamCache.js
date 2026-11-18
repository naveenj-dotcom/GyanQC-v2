const VIDEO_PROXY_URL = "https://gyanqc-video-proxy.naveenj.workers.dev";
const MAX_CACHED_VIDEOS = 6;
const MAX_RAM_BYTES = 180 * 1024 * 1024; // 180 MB cap so mobile browsers never crash

const blobCache = new Map(); // fileId -> { url, size }
const controllers = new Map(); // fileId -> AbortController

export function getStreamUrl(fileId) {
  if (!fileId) return "";
  const hit = blobCache.get(fileId);
  if (hit) {
    // Refresh LRU position
    blobCache.delete(fileId);
    blobCache.set(fileId, hit);
    return hit.url;
  }
  return `${VIDEO_PROXY_URL}?id=${encodeURIComponent(fileId)}`;
}

export function getAdaptiveDriveUrl(fileId, startSec = 0) {
  if (!fileId) return "";
  const base = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  return startSec > 0 ? `${base}?t=${Math.floor(startSec)}` : base;
}

export function isVideoCached(fileId) {
  return Boolean(fileId && blobCache.has(fileId));
}

export function abortOtherDownloads(keepIds = []) {
  const keep = new Set(keepIds.filter(Boolean));
  for (const [id, ctrl] of controllers.entries()) {
    if (!keep.has(id)) {
      ctrl.abort();
      controllers.delete(id);
    }
  }
}

function evictIfNeeded(incomingSize = 0) {
  let totalBytes = 0;
  for (const entry of blobCache.values()) totalBytes += entry.size;

  while (
    blobCache.size > 0 &&
    (blobCache.size >= MAX_CACHED_VIDEOS || totalBytes + incomingSize > MAX_RAM_BYTES)
  ) {
    const oldestKey = blobCache.keys().next().value;
    const oldest = blobCache.get(oldestKey);
    if (oldest) {
      URL.revokeObjectURL(oldest.url);
      totalBytes -= oldest.size;
    }
    blobCache.delete(oldestKey);
  }
}

export async function warmVideoToRam(fileId, { priority = "low" } = {}) {
  if (!fileId) return null;
  if (blobCache.has(fileId)) return blobCache.get(fileId).url;
  if (controllers.has(fileId)) return null;

  // Respect Data-Saver mode on cellular networks
  const conn = typeof navigator !== "undefined" ? navigator.connection : null;
  if (conn?.saveData && priority !== "high") return null;

  const ctrl = new AbortController();
  controllers.set(fileId, ctrl);

  try {
    const res = await fetch(`${VIDEO_PROXY_URL}?id=${encodeURIComponent(fileId)}`, {
      signal: ctrl.signal,
      priority: priority === "high" ? "high" : "low",
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    // Skip RAM caching huge >90 MB raw masters so Range streaming handles them cleanly
    if (blob.size > 90 * 1024 * 1024) return null;

    evictIfNeeded(blob.size);
    const url = URL.createObjectURL(blob);
    blobCache.set(fileId, { url, size: blob.size });
    return url;
  } catch {
    return null;
  } finally {
    controllers.delete(fileId);
  }
}

export function upgradeVideoElementToBlob(videoEl, fileId) {
  if (!videoEl || !fileId || !blobCache.has(fileId)) return false;
  const cachedUrl = blobCache.get(fileId).url;
  const currentSrc = videoEl.getAttribute("src") || "";
  if (currentSrc === cachedUrl || !currentSrc.includes(fileId)) return false;

  const savedTime = videoEl.currentTime || 0;
  const wasPlaying = !videoEl.paused;
  videoEl.src = cachedUrl;
  videoEl.currentTime = savedTime;
  if (wasPlaying) videoEl.play().catch(() => {});
  return true;
}
