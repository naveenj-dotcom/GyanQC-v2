import https from 'https';

export default function handler(req, res) {
  const fileId = req.query.id;
  if (!fileId) {
    res.status(400).send('Missing file ID');
    return;
  }

  const streamFromUrl = (targetUrl, redirectCount = 0) => {
    if (redirectCount > 5) {
      res.status(502).send('Too many redirects');
      return;
    }

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    https
      .get(targetUrl, { headers }, (driveRes) => {
        if (
          [301, 302, 303, 307, 308].includes(driveRes.statusCode) &&
          driveRes.headers.location
        ) {
          streamFromUrl(driveRes.headers.location, redirectCount + 1);
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
              streamFromUrl(nextUrl, redirectCount + 1);
            } else {
              res.status(403).send('Ensure Drive sharing is set to Anyone with the link.');
            }
          });
          return;
        }

        res.status(driveRes.statusCode || 200);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
          if (driveRes.headers[h]) res.setHeader(h, driveRes.headers[h]);
        });

        driveRes.pipe(res);
      })
      .on('error', (err) => res.status(500).send(err.message));
  };

  streamFromUrl(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
}