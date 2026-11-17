import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 15,
});

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

        const streamFromUrl = (targetUrl, redirectCount = 0, triedFallback = false) => {
          if (redirectCount > 6) {
            res.statusCode = 502;
            res.end('Too many redirects');
            return;
          }

          const headers = {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          };
          if (req.headers.range) {
            headers.Range = req.headers.range;
          }

          https
            .get(targetUrl, { headers, agent: keepAliveAgent }, (driveRes) => {
              if (
                [301, 302, 303, 307, 308].includes(driveRes.statusCode) &&
                driveRes.headers.location
              ) {
                const nextLocation = new URL(
                  driveRes.headers.location,
                  targetUrl
                ).toString();
                streamFromUrl(nextLocation, redirectCount + 1, triedFallback);
                return;
              }

              const contentType = driveRes.headers['content-type'] || '';

              if (contentType.includes('text/html')) {
                let html = '';
                driveRes.on('data', (chunk) => (html += chunk));
                driveRes.on('end', () => {
                  const confirmMatch =
                    html.match(/name="confirm"\s+value="([^"]+)"/) ||
                    html.match(/confirm=([0-9A-Za-z_-]+)/);
                  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);

                  if (confirmMatch || uuidMatch) {
                    const confirmVal = confirmMatch ? confirmMatch[1] : 't';
                    const nextUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmVal}${
                      uuidMatch ? `&uuid=${uuidMatch[1]}` : ''
                    }`;
                    streamFromUrl(nextUrl, redirectCount + 1, triedFallback);
                  } else if (!triedFallback) {
                    streamFromUrl(
                      `https://drive.google.com/uc?export=download&id=${fileId}`,
                      redirectCount + 1,
                      true
                    );
                  } else {
                    res.statusCode = 403;
                    res.end(
                      'Blocked by Google Drive: File must be "Anyone with the link" with downloading enabled.'
                    );
                  }
                });
                return;
              }

              res.statusCode = driveRes.statusCode || 200;
              res.setHeader(
                'Content-Type',
                contentType && contentType !== 'application/octet-stream'
                  ? contentType
                  : 'video/mp4'
              );
              if (driveRes.headers['content-length']) {
                res.setHeader('Content-Length', driveRes.headers['content-length']);
              }
              if (driveRes.headers['content-range']) {
                res.setHeader('Content-Range', driveRes.headers['content-range']);
              }
              res.setHeader(
                'Accept-Ranges',
                driveRes.headers['accept-ranges'] || 'bytes'
              );
              res.setHeader('Cache-Control', 'public, max-age=3600');

              req.on('close', () => {
                driveRes.destroy();
              });

              driveRes.pipe(res);
            })
            .on('error', (err) => {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.end(err.message);
              }
            });
        };

        streamFromUrl(
          `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), driveProxyPlugin()],
});