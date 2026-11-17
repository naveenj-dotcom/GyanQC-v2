self.addEventListener('install', () => {
  // Wait for user to click "Update Now" before taking over
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', () => {});
// version 2
