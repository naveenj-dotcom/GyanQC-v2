import webpush from 'web-push';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    'mailto:admin@gyanqc.app',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

// Get today's YYYY-MM-DD in India Standard Time (IST, UTC+5:30)
function getTodayIST() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'Missing VAPID keys' });
  }

  // Allow test notification for a single creator, or run daily scheduled check
  const { testCreatorEmail, showName, episodeLabel } = req.body || {};

  // 1. Instant "Send Test Notification" button from Creator Dashboard
  if (req.method === 'POST' && testCreatorEmail) {
    const cleanEmail = testCreatorEmail.trim().toLowerCase();
    const subs = await supabaseFetch(
      `qc_push_subscriptions?creator_email=eq.${encodeURIComponent(cleanEmail)}`
    );

    const payload = JSON.stringify({
      title: `🎬 Video Target Today — ${showName || 'Your Show'}`,
      body: `Reminder: You have a video target today to submit ${
        episodeLabel || 'your scheduled episode'
      } under "${showName || 'your Show'}".`,
      url: '/',
    });

    let sent = 0;
    for (const row of subs || []) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseFetch(`qc_push_subscriptions?id=eq.${row.id}`, {
            method: 'DELETE',
          });
        }
      }
    }

    return res.status(200).json({ ok: true, sentDevices: sent });
  }

  // 2. Daily Cron / Automatic Check for Today's Scheduled Video Targets
  const targetDate = req.query?.date || getTodayIST();

  const calendarItems = await supabaseFetch(
    `qc_show_calendar?schedule_date=eq.${targetDate}`
  );

  if (!Array.isArray(calendarItems) || calendarItems.length === 0) {
    return res.status(200).json({
      ok: true,
      date: targetDate,
      message: 'No videos scheduled for today.',
      notificationsCreated: 0,
    });
  }

  const shows = await supabaseFetch(`qc_shows?select=*`);
  const episodes = await supabaseFetch(`qc_episodes?select=*`);
  const allSubs = await supabaseFetch(`qc_push_subscriptions?select=*`);

  let notificationsCreated = 0;
  let pushSentCount = 0;

  for (const item of calendarItems) {
    const show = (shows || []).find((s) => s.id === item.show_uuid);
    if (!show || show.status === 'ended') continue;

    const creatorEmail = (show.creator_email || '').trim().toLowerCase();
    if (!creatorEmail) continue;

    // Skip if that episode is already Approved
    const epMatch = (item.episode_label || '').match(/ep\s*(\d+)/i);
    const epNum = epMatch ? parseInt(epMatch[1], 10) : null;
    const epRecord = (episodes || []).find(
      (e) => e.show_uuid === show.id && e.episode_number === epNum
    );
    if (epRecord?.status === 'Approved') continue;

    const title = `🎬 Video Target Today — ${show.show_name}`;
    const body = `You have a video target today to submit ${item.episode_label} under "${show.show_name}".`;

    // Insert into qc_notifications (ignore if already created today)
    const inserted = await supabaseFetch(`qc_notifications`, {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: JSON.stringify([
        {
          creator_email: creatorEmail,
          show_uuid: show.id,
          show_name: show.show_name,
          episode_label: item.episode_label,
          schedule_date: targetDate,
          title,
          body,
        },
      ]),
    });

    if (Array.isArray(inserted) && inserted.length > 0) {
      notificationsCreated++;

      // Send OS Push Notification to all registered devices of this Creator
      const creatorSubs = (allSubs || []).filter(
        (sub) => (sub.creator_email || '').toLowerCase() === creatorEmail
      );

      const pushPayload = JSON.stringify({
        title,
        body,
        url: '/',
      });

      for (const subRow of creatorSubs) {
        try {
          await webpush.sendNotification(subRow.subscription, pushPayload);
          pushSentCount++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseFetch(`qc_push_subscriptions?id=eq.${subRow.id}`, {
              method: 'DELETE',
            });
          }
        }
      }
    }
  }

  return res.status(200).json({
    ok: true,
    date: targetDate,
    notificationsCreated,
    pushSentCount,
  });
}