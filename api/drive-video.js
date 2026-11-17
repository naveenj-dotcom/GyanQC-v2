import https from 'https';

const resolvedUrlCache = new Map();
const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per chunk (stays safely under Vercel's 4.5 MB limit)

function resolveDirectDriveUrl(fileId, targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    https
      .get(targetUrl, { headers: { Range: 'bytes=0-1' } }, (driveRes) => {
        if (
          [301, 302, 303, 307, 308].includes(driveRes.statusCode) &&
          driveRes.headers.location
        ) {
          driveRes.resume();
          resolve(
            resolveDirectDriveUrl(fileId, driveRes.headers.location, redirectCount + 1)
          );
          return;
        }

        const contentType = driveRes.headers['content-type'] || '';
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
              resolve(resolveDirectDriveUrl(fileId, nextUrl, redirectCount + 1));
            } else {
              reject(new Error('Ensure Drive sharing is set to Anyone with the link.'));
            }
          });
          return;
        }

        driveRes.resume();
        resolve(targetUrl);
      })
      .on('error', reject);
  });
}

function pipeChunkedStream(targetUrl, req, res, redirectCount = 0) {
  if (redirectCount > 5) {
    res.status(502).send('Too many redirects');
    return;
  }

  // Parse requested range and cap each response to 2 MB so Vercel never hits its 4.5 MB payload limit
  let start = 0;
  let end = MAX_CHUNK_SIZE - 1;

  if (req.headers.range) {
    const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      const requestedEnd = match[2] ? parseInt(match[2], 10) : start + MAX_CHUNK_SIZE - 1;
      end = Math.min(requestedEnd, start + MAX_CHUNK_SIZE - 1);
    }
  }

  https
    .get(targetUrl, { headers: { Range: `bytes=${start}-${end}` } }, (driveRes) => {
      if (
        [301, 302, 303, 307, 308].includes(driveRes.statusCode) &&
        driveRes.headers.location
      ) {
        driveRes.resume();
        pipeChunkedStream(driveRes.headers.location, req, res, redirectCount + 1);
        return;
      }

      res.status(driveRes.statusCode || 206);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
        if (driveRes.headers[h]) res.setHeader(h, driveRes.headers[h]);
      });

      driveRes.pipe(res);
    })
    .on('error', (err) => {
      if (!res.headersSent) res.status(500).send(err.message);
    });
}

export default async function handler(req, res) {
  const fileId = req.query.id;
  if (!fileId) {
    res.status(400).send('Missing file ID');
    return;
  }

  try {
    const cached = resolvedUrlCache.get(fileId);
    let directUrl;

    if (cached && cached.expiresAt > Date.now()) {
      directUrl = cached.url;
    } else {
      const initialUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
      directUrl = await resolveDirectDriveUrl(fileId, initialUrl);
      resolvedUrlCache.set(fileId, {
        url: directUrl,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
    }

    pipeChunkedStream(directUrl, req, res);
  } catch (err) {
    resolvedUrlCache.delete(fileId);
    res.status(403).send(err.message || 'Could not load Google Drive video.');
  }
}