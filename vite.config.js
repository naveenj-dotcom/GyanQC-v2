import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';

function driveProxyPlugin() {
  return {
    name: 'drive-video-proxy',
    configureServer(server) {
      server.middlewares.use('/api/drive-video', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const fileId = url.searchParams.get('id');

        if (!fileId) {
          res.statusCode = 400;
          res.end('Missing file ID');
          return;
        }

        const streamFromUrl = (targetUrl, redirectCount = 0) => {
          if (redirectCount > 5) {
            res.statusCode = 502;
            res.end('Too many redirects');
            return;
          }

          const headers = {};
          if (req.headers.range) {
            headers.Range = req.headers.range;
          }

          https
            .get(targetUrl, { headers }, (driveRes) => {
              // Follow redirects
              if (
                [301, 302, 303, 307, 308].includes(driveRes.statusCode) &&
                driveRes.headers.location
              ) {
                streamFromUrl(driveRes.headers.location, redirectCount + 1);
                return;
              }

              const contentType = driveRes.headers['content-type'] || '';

              // Handle Google Drive large-file virus scan confirmation HTML page
              if (contentType.includes('text/html')) {
                let html = '';
                driveRes.on('data', (chunk) => (html += chunk));
                driveRes.on('end', () => {
                  const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
                  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);

                  if (confirmMatch) {
                    const nextUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}${
                      uuidMatch ? `&uuid=${uuidMatch[1]}` : ''
                    }`;
                    streamFromUrl(nextUrl, redirectCount + 1);
                  } else {
                    res.statusCode = 403;
                    res.end('Unable to access Drive video. Ensure sharing is set to Anyone with the link.');
                  }
                });
                return;
              }

              // Forward video headers (including Range seeking support)
              res.statusCode = driveRes.statusCode || 200;
              if (driveRes.headers['content-type']) {
                res.setHeader('Content-Type', driveRes.headers['content-type']);
              }
              if (driveRes.headers['content-length']) {
                res.setHeader('Content-Length', driveRes.headers['content-length']);
              }
              if (driveRes.headers['content-range']) {
                res.setHeader('Content-Range', driveRes.headers['content-range']);
              }
              if (driveRes.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', driveRes.headers['accept-ranges']);
              }

              driveRes.pipe(res);
            })
            .on('error', (err) => {
              res.statusCode = 500;
              res.end(err.message);
            });
        };

        streamFromUrl(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), driveProxyPlugin()],
});