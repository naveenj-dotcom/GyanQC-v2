import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getTodayIST() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffsetMs).toISOString().slice(0, 10);
}

export default function CreatorNotificationBell({ currentUser, creatorShows = [] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const creatorEmail = (currentUser?.email || '').trim().toLowerCase();

  // Sync today's scheduled targets into qc_notifications for this Creator & load bell items
  const syncAndLoadNotifications = async () => {
    if (!creatorEmail) return;

    const today = getTodayIST();
    const activeShowIds = creatorShows
      .filter((s) => s.status !== 'ended')
      .map((s) => s.id);

    if (activeShowIds.length > 0) {
      const { data: todayCal } = await supabase
        .from('qc_show_calendar')
        .select('*')
        .eq('schedule_date', today)
        .in('show_uuid', activeShowIds);

      if (todayCal && todayCal.length > 0) {
        const rowsToInsert = todayCal.map((item) => {
          const showObj = creatorShows.find((s) => s.id === item.show_uuid);
          const showName = showObj?.show_name || 'Your Show';
          return {
            creator_email: creatorEmail,
            show_uuid: item.show_uuid,
            show_name: showName,
            episode_label: item.episode_label,
            schedule_date: today,
            title: `🎬 Video Target Today — ${showName}`,
            body: `You have a video target today to submit ${item.episode_label} under "${showName}".`,
          };
        });

        await supabase
          .from('qc_notifications')
          .upsert(rowsToInsert, {
            onConflict: 'creator_email,show_uuid,episode_label,schedule_date',
            ignoreDuplicates: true,
          });
      }
    }

    const { data: list } = await supabase
      .from('qc_notifications')
      .select('*')
      .eq('creator_email', creatorEmail)
      .order('created_at', { ascending: false })
      .limit(20);

    if (list) setNotifications(list);
  };

  // Check if this browser/device is already subscribed to Web Push
  const checkExistingSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const existing = await reg.pushManager.getSubscription();
      if (existing && Notification.permission === 'granted') {
        setPushEnabled(true);
      }
    } catch (e) {
      console.warn('SW check skipped:', e);
    }
  };

  useEffect(() => {
    syncAndLoadNotifications();
    checkExistingSubscription();
  }, [creatorEmail, creatorShows.length]);

  const handleEnableDevicePush = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Your browser does not support desktop/mobile push notifications.');
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      alert('Push key is missing. Please redeploy Vercel after saving environment variables.');
      return;
    }

    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert(
          'Notification permission was blocked. Please click the lock/tune icon in your browser address bar and allow Notifications.'
        );
        setSubscribing(false);
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = subscription.toJSON();
      const deviceLabel = navigator.userAgent.includes('Mobile')
        ? 'Mobile Browser'
        : 'Laptop / Desktop Browser';

      await supabase.from('qc_push_subscriptions').upsert(
        [
          {
            creator_email: creatorEmail,
            creator_id: currentUser?.creator_id || '',
            endpoint: subJson.endpoint,
            subscription: subJson,
            device_label: deviceLabel,
          },
        ],
        { onConflict: 'endpoint' }
      );

      setPushEnabled(true);
      alert(
        'Desktop/Mobile Push Notifications enabled! You will receive a banner on this device whenever you have a video target scheduled today.'
      );
    } catch (err) {
      alert('Could not enable notifications: ' + err.message);
    }
    setSubscribing(false);
  };

  const handleSendTestPush = async () => {
    setTestingPush(true);
    const sampleShow = creatorShows[0]?.show_name || 'Your Active Show';
    try {
      const res = await fetch('/api/send-scheduled-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCreatorEmail: creatorEmail,
          showName: sampleShow,
          episodeLabel: 'Ep 1',
        }),
      });
      const data = await res.json();
      if (data.ok && data.sentDevices > 0) {
        alert(`Test notification sent to ${data.sentDevices} device(s)! Check your OS notification banner.`);
      } else {
        alert('Click "Enable Laptop/Phone Alerts" first so this device is registered.');
      }
    } catch (err) {
      alert('Test push failed: ' + err.message);
    }
    setTestingPush(false);
  };

  const handleMarkAllRead = async () => {
    if (!creatorEmail) return;
    await supabase
      .from('qc_notifications')
      .update({ is_read: true })
      .eq('creator_email', creatorEmail)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) syncAndLoadNotifications();
        }}
        title="Video Target Notifications"
        style={bellStyles.bellBtn}
      >
        <span style={{ fontSize: '17px', lineHeight: 1 }}>🔔</span>
        {unreadCount > 0 && <span style={bellStyles.badge}>{unreadCount}</span>}
      </button>

      {open && (
        <div style={bellStyles.dropdown}>
          <div style={bellStyles.dropdownHeader}>
            <div>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                Today&apos;s Video Targets
              </strong>
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                Daily reminders for scheduled episodes
              </span>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={bellStyles.markReadBtn}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Push Enable / Test Banner */}
          <div style={bellStyles.pushBar}>
            {!pushEnabled ? (
              <button
                type="button"
                disabled={subscribing}
                onClick={handleEnableDevicePush}
                style={bellStyles.enablePushBtn}
              >
                {subscribing
                  ? 'Enabling...'
                  : '🔔 Enable Laptop / Mobile Push Alerts'}
              </button>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#166534' }}>
                  ✓ Laptop / Mobile Alerts Active
                </span>
                <button
                  type="button"
                  disabled={testingPush}
                  onClick={handleSendTestPush}
                  style={bellStyles.testBtn}
                >
                  {testingPush ? 'Sending...' : 'Send Test Banner'}
                </button>
              </div>
            )}
          </div>

          {/* Notification Items List */}
          <div style={bellStyles.listContainer}>
            {notifications.length === 0 ? (
              <div style={bellStyles.emptyState}>
                No video targets scheduled for today yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    ...bellStyles.item,
                    backgroundColor: n.is_read ? '#ffffff' : '#eff6ff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                    <strong style={{ fontSize: '12px', color: '#0f172a' }}>{n.title}</strong>
                    <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {n.schedule_date}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                    {n.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const bellStyles = {
  bellBtn: {
    position: 'relative',
    backgroundColor: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    padding: '7px 11px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '800',
    minWidth: '18px',
    height: '18px',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '44px',
    width: '340px',
    maxWidth: '90vw',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.18)',
    zIndex: 1200,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  markReadBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  pushBar: {
    padding: '10px 14px',
    backgroundColor: '#f0fdf4',
    borderBottom: '1px solid #bbf7d0',
  },
  enablePushBtn: {
    width: '100%',
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  testBtn: {
    backgroundColor: '#ffffff',
    color: '#166534',
    border: '1px solid #86efac',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  listContainer: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  emptyState: {
    padding: '24px 16px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#64748b',
  },
  item: {
    padding: '12px 14px',
    borderBottom: '1px solid #f1f5f9',
  },
};