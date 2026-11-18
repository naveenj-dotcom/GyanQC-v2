import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onLoginSuccess, logoUrl }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Unified email lookup for Admin, QCstar, and Creator accounts
  const authenticateByEmail = async (rawEmail, fallbackName = '') => {
    const cleanEmail = (rawEmail || '').trim().toLowerCase();
    if (!cleanEmail) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    // 1. Check if email belongs to QCstar or Admin (qc_users)
    const { data: staffUser, error: staffError } = await supabase
      .from('qc_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (staffError) {
      setLoading(false);
      setMessage({ type: 'error', text: 'Connection error: ' + staffError.message });
      return;
    }

    if (staffUser) {
      setLoading(false);
      if (staffUser.status === 'pending') {
        setMessage({
          type: 'warning',
          text: 'Your QCstar access request is still pending Admin approval.',
        });
        return;
      }
      if (staffUser.status === 'rejected') {
        setMessage({
          type: 'error',
          text: 'Your access was revoked or rejected. Contact your Admin.',
        });
        return;
      }
      onLoginSuccess(staffUser);
      return;
    }

    // 2. Check if email belongs to a Creator (qc_creators or qc_shows)
    const [{ data: creatorRecord }, { data: linkedShows, error: showsError }] =
      await Promise.all([
        supabase
          .from('qc_creators')
          .select('*')
          .eq('creator_email', cleanEmail)
          .maybeSingle(),
        supabase
          .from('qc_shows')
          .select('*')
          .eq('creator_email', cleanEmail),
      ]);

    setLoading(false);

    if (showsError) {
      setMessage({ type: 'error', text: 'Connection error: ' + showsError.message });
      return;
    }

    const allShows = linkedShows || [];
    const activeShows = allShows.filter((s) => s.status !== 'ended');

    if (creatorRecord || allShows.length > 0) {
      if (activeShows.length === 0) {
        setMessage({
          type: 'error',
          text: creatorRecord
            ? `Welcome ${creatorRecord.creator_name} (${creatorRecord.creator_id})! No active shows are linked to your account yet. Please contact your QCstar.`
            : 'All shows linked to this email have been ended. Please contact your QCstar for assistance.',
        });
        return;
      }

      const primaryShow = activeShows[0];
      const resolvedCreatorId =
        creatorRecord?.creator_id || primaryShow.creator_id || primaryShow.show_id;
      const resolvedCreatorName =
        creatorRecord?.creator_name || primaryShow.creator_name || fallbackName || cleanEmail;

      onLoginSuccess({
        id: creatorRecord?.id || primaryShow.id,
        role: 'creator',
        creator_id: resolvedCreatorId,
        show_id: resolvedCreatorId,
        full_name: resolvedCreatorName,
        email: cleanEmail,
        show: primaryShow,
        shows: activeShows,
      });
      return;
    }

    // 3. Email not found in either table -> offer QCstar access request
    setEmail(cleanEmail);
    if (fallbackName && !fullName) {
      setFullName(fallbackName);
    }
    setIsRequestingAccess(true);
    setMessage({
      type: 'info',
      text: 'This email is not registered yet. If you are a Creator, ask your QCstar to add your email. If you are a QCstar, enter your name below to request access.',
    });
  };

  // Handle Google OAuth redirect return automatically
  useEffect(() => {
    let mounted = true;

    const checkGoogleRedirectSession = async () => {
      const { data } = await supabase.auth.getSession();
      const authUser = data?.session?.user;
      if (mounted && authUser?.email) {
        const googleName =
          authUser.user_metadata?.full_name || authUser.user_metadata?.name || '';
        await supabase.auth.signOut(); // Clear Supabase auth session after reading verified email
        authenticateByEmail(authUser.email, googleName);
      }
    };

    checkGoogleRedirectSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.email && mounted) {
          const googleName =
            session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
          await supabase.auth.signOut();
          authenticateByEmail(session.user.email, googleName);
        }
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setMessage({ type: '', text: '' });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setGoogleLoading(false);
      setMessage({
        type: 'error',
        text: 'Google Sign-In error: ' + error.message,
      });
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    await authenticateByEmail(email);
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.from('qc_users').insert([
      {
        email: cleanEmail,
        full_name: fullName.trim(),
        role: 'qcstar',
        status: 'pending',
      },
    ]);

    setLoading(false);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to submit request: ' + error.message });
    } else {
      setIsRequestingAccess(false);
      setMessage({
        type: 'success',
        text: 'Request sent! Once Admin approves your QCstar account, you can sign in.',
      });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="GyanQC Logo"
              style={styles.customLogoImg}
            />
          ) : (
            <div style={styles.logoBadge}>G</div>
          )}
          <span style={styles.brandName}>GyanQC</span>
        </div>

        <h1 style={styles.title}>Operations Workspace</h1>
        <p style={styles.subtitle}>Sign in to continue (stays signed in for 30 days)</p>

        {message.text && (
          <div
            style={{
              ...styles.alert,
              backgroundColor:
                message.type === 'error'
                  ? '#fee2e2'
                  : message.type === 'success'
                  ? '#dcfce7'
                  : '#fef3c7',
              color:
                message.type === 'error'
                  ? '#991b1b'
                  : message.type === 'success'
                  ? '#166534'
                  : '#92400e',
            }}
          >
            {message.text}
          </div>
        )}

        {!isRequestingAccess ? (
          <>
            {/* Fast 1-Click Google Login */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              style={styles.googleBtn}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>{googleLoading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </button>

            <div style={styles.dividerRow}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>or sign in with email</span>
              <span style={styles.dividerLine} />
            </div>

            <form onSubmit={handleEmailLogin} style={styles.form}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
              />

              <button type="submit" disabled={loading || googleLoading} style={styles.button}>
                {loading ? 'Signing In...' : '→ Sign In'}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleRequestAccess} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input type="email" disabled value={email} style={{ ...styles.input, opacity: 0.7 }} />

            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Verma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={styles.input}
            />

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Sending Request...' : 'Request QCstar Access'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRequestingAccess(false);
                setMessage({ type: '', text: '' });
              }}
              style={styles.linkBtn}
            >
              ← Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eef4',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '410px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '36px 32px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px',
  },
  logoBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    fontWeight: '800',
    fontSize: '17px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customLogoImg: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    objectFit: 'contain',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    padding: '2px',
  },
  brandName: {
    fontSize: '19px',
    fontWeight: '700',
    color: '#0f172a',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '23px',
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    margin: '0 0 22px 0',
    fontSize: '14px',
    color: '#64748b',
  },
  googleBtn: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '18px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    fontSize: '12px',
    color: '#64748b',
    whiteSpace: 'nowrap',
  },
  alert: {
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    padding: '11px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: '#f8fafc',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#1d4ed8',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '4px',
  },
};