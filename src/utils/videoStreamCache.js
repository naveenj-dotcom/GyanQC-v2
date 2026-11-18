const VIDEO_PROXY_URL = "https://gyanqc-video-proxy.naveenj.workers.dev";
const primedIds = new Set();
const activeControllers = new Map();

export function getStreamUrl(fileId) {
  if (!fileId) return "";
  return `${VIDEO_PROXY_URL}?id=${fileId}`;
}

export function isVideoCached(fileId) {
  return Boolean(fileId && primedIds.has(fileId));
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

// Lightweight 2MB head-range prime: warms Cloudflare Worker + Drive edge without choking active video bandwidth
export async function warmVideoToRam(fileId) {
  if (!fileId || primedIds.has(fileId) || activeControllers.has(fileId)) return null;
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return null;

  const controller = new AbortController();
  activeControllers.set(fileId, controller);

  try {
    const res = await fetch(`${VIDEO_PROXY_URL}?id=${fileId}`, {
      headers: { Range: "bytes=0-2097151" },
      signal: controller.signal,
    });
    if (res.ok || res.status === 206) {
      await res.arrayBuffer();
      if (!controller.signal.aborted) {
        primedIds.add(fileId);
      }
    }
  } catch {
    // Ignore aborted or network errors
  } finally {
    activeControllers.delete(fileId);
  }
  return null;
}

// No-op: never swap <video>.src mid-playback (prevents decoder stalls & double-downloading)
export function upgradeVideoElementToBlob() {}
