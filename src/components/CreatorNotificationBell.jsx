import { useEffect, useRef, useState } from 'react';
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
  const [pushStatus, setPushStatus] = useState('checking');
  const autoPromptedRef = useRef(false);

  const creatorEmail = (currentUser?.email || '').trim().toLowerCase();

  const registerDeviceSubscription = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    if (Notification.permission !== 'granted') return false;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let subscription = await reg.pushManager.getSubscription();
      if (!subscription && VAPID_PUBLIC_KEY) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      if (subscription && creatorEmail) {
        const subJson = subscription.toJSON();
        const deviceLabel = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
          ? 'Mobile Device'
          : 'Laptop / Desktop';

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
      }
      setPushStatus('granted');
      return true;
    } catch (err) {
      console.warn('Push registration note:', err);
      setPushStatus(Notification.permission);
      return false;
    }
  };

  const requestPermissionAutomatically = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const currentPerm = Notification.permission;
    setPushStatus(currentPerm);

    if (currentPerm === 'granted') {
      await registerDeviceSubscription();
      return;
    }

    if (currentPerm === 'default' && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      try {
        const result = await Notification.requestPermission();
        setPushStatus(result);
        if (result === 'granted') {
          await registerDeviceSubscription();
        }
      } catch (err) {
        console.warn('Permission request skipped:', err);
      }
    }
  };

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

  useEffect(() => {
    requestPermissionAutomatically();
  }, [creatorEmail]);

  useEffect(() => {
    syncAndLoadNotifications();
  }, [creatorEmail, creatorShows.length]);

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
          if (nextOpen) {
            syncAndLoadNotifications();
            requestPermissionAutomatically();
          }
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
                Automatic alerts on Laptop &amp; Mobile
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

          <div
            style={{
              ...bellStyles.pushBar,
              backgroundColor: pushStatus === 'denied' ? '#fef2f2' : '#f0fdf4',
              borderBottom:
                pushStatus === 'denied' ? '1px solid #fecaca' : '1px solid #bbf7d0',
            }}
          >
            {pushStatus === 'denied' ? (
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#b91c1c' }}>
                Notifications blocked in browser. Click the lock/tune icon in the address bar → Allow Notifications.
              </span>
            ) : pushStatus === 'granted' ? (
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#166534' }}>
                ✓ Laptop / Mobile Alerts Active
              </span>
            ) : (
              <button
                type="button"
                onClick={requestPermissionAutomatically}
                style={bellStyles.enablePushBtn}
              >
                Allow Laptop / Mobile Notifications
              </button>
            )}
          </div>

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