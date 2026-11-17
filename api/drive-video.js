import https from 'https';

const resolvedCache = new Map();
const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per chunk (under Vercel's 4.5 MB limit)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchUrl(targetUrl, headers = {}, cookies = []) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'User-Agent': UA,
      ...headers,
    };
    if (cookies.length > 0) {
      reqHeaders.Cookie = cookies.join('; ');
    }

    https
      .get(targetUrl, { headers: reqHeaders }, (res) => {
        const setCookies = res.headers['set-cookie'] || [];
        const mergedCookies = [
          ...cookies,
          ...setCookies.map((c) => c.split(';')[0]),
        ];

        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          resolve(fetchUrl(nextUrl, headers, mergedCookies));
          return;
        }

        resolve({ res, finalUrl: targetUrl, cookies: mergedCookies });
      })
      .on('error', reject);
  });
}

async function resolveDirectDriveUrl(fileId) {
  const startUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  const { res, finalUrl, cookies } = await fetchUrl(startUrl, {
    Range: 'bytes=0-1',
  });

  const contentType = res.headers['content-type'] || '';
  if (!contentType.includes('text/html')) {
    res.resume();
    return { url: finalUrl, cookies };
  }

  let html = '';
  for await (const chunk of res) {
    html += chunk;
  }

  const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);

  if (!confirmMatch) {
    throw new Error('Could not bypass Google Drive download confirmation.');
  }

  const confirmedUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}${
    uuidMatch ? `&uuid=${uuidMatch[1]}` : ''
  }`;

  return { url: confirmedUrl, cookies };
}

export default async function handler(req, res) {
  const fileId = req.query.id;
  if (!fileId) {
    res.status(400).send('Missing file ID');
    return;
  }

  try {
    let entry = resolvedCache.get(fileId);
    if (!entry || entry.expiresAt <= Date.now()) {
      const resolved = await resolveDirectDriveUrl(fileId);
      entry = {
        ...resolved,
        expiresAt: Date.now() + 20 * 60 * 1000,
      };
      resolvedCache.set(fileId, entry);
    }

    let start = 0;
    let end = MAX_CHUNK_SIZE - 1;
    if (req.headers.range) {
      const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        start = parseInt(match[1], 10);
        const requestedEnd = match[2]
          ? parseInt(match[2], 10)
          : start + MAX_CHUNK_SIZE - 1;
        end = Math.min(requestedEnd, start + MAX_CHUNK_SIZE - 1);
      }
    }

    const { res: driveRes } = await fetchUrl(
      entry.url,
      { Range: `bytes=${start}-${end}` },
      entry.cookies
    );

    const contentType = driveRes.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      driveRes.resume();
      resolvedCache.delete(fileId);
      res.status(403).send('Google Drive returned HTML instead of video.');
      return;
    }

    res.status(driveRes.statusCode || 206);
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(
      (h) => {
        if (driveRes.headers[h]) res.setHeader(h, driveRes.headers[h]);
      }
    );

    driveRes.pipe(res);
  } catch (err) {
    resolvedCache.delete(fileId);
    res.status(403).send(err.message || 'Could not load Google Drive video.');
  }
}