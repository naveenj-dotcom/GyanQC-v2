import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  let customLogo = '';

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/qc_settings?key=eq.app_logo_url&select=value`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        }
      );
      const rows = await response.json();
      if (Array.isArray(rows) && rows[0]?.value) {
        customLogo = rows[0].value.trim();
      }
    } catch {
      // Fall back to default icon
    }
  }

  // 1. If Admin uploaded a file (Base64 data URL), decode & serve real image bytes
  if (customLogo.startsWith('data:image/')) {
    const match = customLogo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(buffer);
    }
  }

  // 2. If Admin pasted an external HTTP(S) URL, proxy its image bytes
  if (customLogo.startsWith('http://') || customLogo.startsWith('https://')) {
    try {
      const imgRes = await fetch(customLogo);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/png';
        const arrayBuf = await imgRes.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(Buffer.from(arrayBuf));
      }
    } catch {
      // Fall back to default icon
    }
  }

  // 3. Fallback to default public/icon-192.png (or favicon.svg)
  try {
    const defaultPng = path.join(process.cwd(), 'public', 'icon-192.png');
    if (fs.existsSync(defaultPng)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(fs.readFileSync(defaultPng));
    }
  } catch {
    // Ignore
  }

  const defaultSvg = path.join(process.cwd(), 'public', 'favicon.svg');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).send(fs.readFileSync(defaultSvg));
}