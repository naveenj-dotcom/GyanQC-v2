const VIDEO_PROXY_URL = "https://gyanqc-video-proxy.naveenj.workers.dev";

export function getStreamUrl(fileId) {
  if (!fileId) return "";
  return `${VIDEO_PROXY_URL}?id=${fileId}`;
}

export function getAdaptiveDriveUrl(fileId, startSeconds = 0) {
  if (!fileId) return "";
  const sec = Math.max(0, Math.floor(Number(startSeconds) || 0));
  return sec > 0
    ? `https://drive.google.com/file/d/${fileId}/preview?t=${sec}s`
    : `https://drive.google.com/file/d/${fileId}/preview`;
}

export function isVideoCached() {
  return false;
}

export function abortOtherDownloads() {}
export async function warmVideoToRam() {
  return null;
}
export function upgradeVideoElementToBlob() {}
