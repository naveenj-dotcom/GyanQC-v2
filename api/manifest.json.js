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
        customLogo = rows[0].value;
      }
    } catch {
      // Fall back to default static icons
    }
  }

  const icons = customLogo
    ? [
        {
          src: customLogo,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: customLogo,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ]
    : [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ];

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).json({
    name: 'GyanQC',
    short_name: 'GyanQC',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1e3a8a',
    icons,
  });
}