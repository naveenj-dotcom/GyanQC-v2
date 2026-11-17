import https from 'https';

// Cache resolved direct Google Drive CDN URLs in memory so range requests don't re-fetch HTML confirmation pages
const resolvedUrlCache = new Map();

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

        // We reached the actual direct video stream URL! Discard the 2-byte probe and return the URL.
        driveRes.resume();
        resolve(targetUrl);
      })
      .on('error', reject);
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
      // Cache for 30 minutes
      resolvedUrlCache.set(fileId, {
        url: directUrl,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
    }

    // Redirect browser directly to Google's high-speed CDN for instant streaming & scrubbing
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.redirect(307, directUrl);
  } catch (err) {
    resolvedUrlCache.delete(fileId);
    res.status(403).send(err.message || 'Could not load Google Drive video.');
  }
}