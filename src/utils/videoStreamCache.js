const VIDEO_PROXY_URL = "https://gyanqc-video-proxy.naveenj.workers.dev";
const isMobileDevice = () =>
  typeof window !== "undefined" &&
  (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
const getMaxCachedVideos = () => (isMobileDevice() ? 2 : 6);

const blobCache = new Map(); // fileId -> blobUrl
const activeControllers = new Map(); // fileId -> AbortController

export function getStreamUrl(fileId) {
  if (!fileId) return "";
  return blobCache.get(fileId) || `${VIDEO_PROXY_URL}?id=${fileId}`;
}

export function isVideoCached(fileId) {
  return Boolean(fileId && blobCache.has(fileId));
}

export function abortOtherDownloads(keepFileIds = []) {
  const keep = new Set(keepFileIds.filter(Boolean));
  for (const [id, ctrl] of activeControllers.entries()) {
    if (!keep.has(id)) {
      ctrl.abort();
      activeControllers.delete(id);
    }
  }
}

export async function warmVideoToRam(fileId, { onReadyBlob } = {}) {
  if (!fileId) return null;
  if (blobCache.has(fileId)) {
    const existing = blobCache.get(fileId);
    blobCache.delete(fileId);
    blobCache.set(fileId, existing);
    if (onReadyBlob) onReadyBlob(existing);
    return existing;
  }
  if (activeControllers.has(fileId)) return null;

  const controller = new AbortController();
  activeControllers.set(fileId, controller);

  try {
    const res = await fetch(`${VIDEO_PROXY_URL}?id=${fileId}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    if (!blob || blob.size === 0 || controller.signal.aborted) return null;

    const maxCached = getMaxCachedVideos();
    while (blobCache.size >= maxCached) {
      const oldestId = blobCache.keys().next().value;
      const oldestUrl = blobCache.get(oldestId);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
      blobCache.delete(oldestId);
    }

    const blobUrl = URL.createObjectURL(blob);
    blobCache.set(fileId, blobUrl);
    if (onReadyBlob && !controller.signal.aborted) {
      onReadyBlob(blobUrl);
    }
    return blobUrl;
  } catch {
    return null;
  } finally {
    activeControllers.delete(fileId);
  }
}

export function upgradeVideoElementToBlob(videoEl, fileId, setUrlState) {
  if (!videoEl || !fileId) return;
  const currentSrc = videoEl.getAttribute("src") || "";
  if (currentSrc.startsWith("blob:")) return;

  warmVideoToRam(fileId, {
    onReadyBlob: (blobUrl) => {
      if (!videoEl) return;
      const liveSrc = videoEl.getAttribute("src") || "";
      if (!liveSrc.includes(fileId)) return;

      const savedTime = videoEl.currentTime || 0;
      const wasPlaying = !videoEl.paused;
      if (setUrlState) setUrlState(blobUrl);
      else videoEl.src = blobUrl;

      requestAnimationFrame(() => {
        if (!videoEl) return;
        videoEl.currentTime = savedTime;
        if (wasPlaying) videoEl.play().catch(() => {});
      });
    },
  });
}
