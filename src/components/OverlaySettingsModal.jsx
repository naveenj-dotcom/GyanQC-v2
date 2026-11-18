import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const DEFAULT_OVERLAY_URL = '/default-overlay.png';

export default function OverlaySettingsModal({
  currentOverlayUrl,
  currentLogoUrl,
  onSavedOverlay,
  onSavedLogo,
  onClose,
}) {
  const [activeSection, setActiveSection] = useState('overlay'); // 'overlay' | 'logo'

  // Overlay state
  const [previewUrl, setPreviewUrl] = useState(currentOverlayUrl || DEFAULT_OVERLAY_URL);
  const [urlInput, setUrlInput] = useState(
    currentOverlayUrl && !currentOverlayUrl.startsWith('data:') ? currentOverlayUrl : ''
  );
  const [savingOverlay, setSavingOverlay] = useState(false);
  const overlayFileInputRef = useRef(null);

  // App Logo state
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(currentLogoUrl || '');
  const [logoUrlInput, setLogoUrlInput] = useState(
    currentLogoUrl && !currentLogoUrl.startsWith('data:') ? currentLogoUrl : ''
  );
  const [savingLogo, setSavingLogo] = useState(false);
  const logoFileInputRef = useRef(null);

  const handleOverlayFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid PNG, JPG, or WEBP image.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Please upload an image under 2 MB (transparent PNG recommended).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
        setUrlInput('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveOverlay = async () => {
    const finalUrl = (previewUrl || DEFAULT_OVERLAY_URL).trim();
    setSavingOverlay(true);

    const { error } = await supabase
      .from('qc_settings')
      .upsert(
        [
          {
            key: 'video_overlay_url',
            value: finalUrl,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'key' }
      );

    setSavingOverlay(false);
    if (error) {
      alert('Failed to save overlay image: ' + error.message);
      return;
    }

    onSavedOverlay(finalUrl);
    onClose();
  };

  const handleLogoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid PNG, JPG, SVG, or WEBP logo image.');
      return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
      alert('Please upload a logo image under 1.5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoPreviewUrl(reader.result);
        setLogoUrlInput('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveLogo = async () => {
    const finalLogo = (logoPreviewUrl || '').trim();
    setSavingLogo(true);

    const { error } = await supabase
      .from('qc_settings')
      .upsert(
        [
          {
            key: 'app_logo_url',
            value: finalLogo,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'key' }
      );

    setSavingLogo(false);
    if (error) {
      alert('Failed to save app logo: ' + error.message);
      return;
    }

    onSavedLogo(finalLogo);
    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>
              Brand &amp; Video Player Settings
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Customize the global 9:16 video safe-zone overlay and GyanQC app logo.
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ✕ Close
          </button>
        </div>

        {/* Section Switcher Tabs */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => setActiveSection('overlay')}
            style={activeSection === 'overlay' ? styles.tabActive : styles.tab}
          >
            🎬 Video Player Overlay
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('logo')}
            style={activeSection === 'logo' ? styles.tabActive : styles.tab}
          >
            🏷️ App Logo
          </button>
        </div>

        {activeSection === 'overlay' ? (
          <div style={styles.bodyGrid}>
            <div style={styles.controlsCol}>
              <input
                ref={overlayFileInputRef}
                type="file"
                accept="image/png,image/webp,image/jpeg,image/svg+xml"
                hidden
                onChange={handleOverlayFileChange}
              />

              <button
                type="button"
                onClick={() => overlayFileInputRef.current?.click()}
                style={styles.uploadBtn}
              >
                📁 Upload New Overlay Image (PNG / WEBP)
              </button>

              <div style={{ marginTop: '14px' }}>
                <label style={styles.label}>Or Paste Direct Image URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    placeholder="https://example.com/safe-zone-overlay.png"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (urlInput.trim()) setPreviewUrl(urlInput.trim());
                    }}
                    className="secondary-button"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={savingOverlay}
                  onClick={handleSaveOverlay}
                  className="primary-button"
                  style={{ flex: 1 }}
                >
                  {savingOverlay ? 'Saving Globally...' : '✓ Save Overlay for All Players'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(DEFAULT_OVERLAY_URL);
                    setUrlInput('');
                  }}
                  className="secondary-button"
                >
                  Reset to Default
                </button>
              </div>
            </div>

            <div style={styles.previewCol}>
              <span style={styles.previewTag}>LIVE 9:16 SAFE-ZONE PREVIEW</span>
              <div style={styles.previewFrame}>
                <div style={styles.mockVideoBg}>9:16 Video Frame</div>
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Overlay Preview"
                    style={styles.previewImg}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.bodyGrid}>
            <div style={styles.controlsCol}>
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/png,image/webp,image/jpeg,image/svg+xml"
                hidden
                onChange={handleLogoFileChange}
              />

              <button
                type="button"
                onClick={() => logoFileInputRef.current?.click()}
                style={styles.uploadBtn}
              >
                🖼️ Upload App Logo (PNG / SVG / WEBP)
              </button>

              <div style={{ marginTop: '14px' }}>
                <label style={styles.label}>Or Paste Direct Logo Image URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    placeholder="https://example.com/brand-logo.png"
                    value={logoUrlInput}
                    onChange={(e) => setLogoUrlInput(e.target.value)}
                    style={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (logoUrlInput.trim()) setLogoPreviewUrl(logoUrlInput.trim());
                    }}
                    className="secondary-button"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={savingLogo}
                  onClick={handleSaveLogo}
                  className="primary-button"
                  style={{ flex: 1 }}
                >
                  {savingLogo ? 'Saving Logo...' : '✓ Save App Logo'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLogoPreviewUrl('');
                    setLogoUrlInput('');
                  }}
                  className="secondary-button"
                >
                  Reset to Default "G"
                </button>
              </div>
            </div>

            <div style={styles.previewCol}>
              <span style={styles.previewTag}>LIVE HEADER LOGO PREVIEW</span>
              <div style={styles.logoPreviewBox}>
                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="GyanQC Logo Preview"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      objectFit: 'contain',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      padding: '2px',
                    }}
                  />
                ) : (
                  <div className="brand-icon">G</div>
                )}
                <div>
                  <strong style={{ display: 'block', fontSize: '16px', color: '#0f172a' }}>
                    GyanQC
                  </strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Header &amp; Login Badge
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '20px',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '720px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '14px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px',
  },
  closeBtn: {
    background: '#f1f5f9',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
  },
  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '18px',
  },
  tab: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  tabActive: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #1e3a8a',
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  bodyGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px',
    gap: '20px',
    alignItems: 'center',
  },
  controlsCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  uploadBtn: {
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    border: '2px dashed #93c5fd',
    borderRadius: '10px',
    padding: '14px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700',
    color: '#334155',
    marginBottom: '6px',
  },
  input: {
    flex: 1,
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
  },
  previewCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  previewTag: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
    marginBottom: '8px',
  },
  previewFrame: {
    position: 'relative',
    width: '165px',
    height: '293px',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    border: '2px solid #cbd5e1',
  },
  mockVideoBg: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600',
  },
  previewImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    opacity: 0.85,
  },
  logoPreviewBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '18px 20px',
    borderRadius: '12px',
    border: '1.5px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    width: '100%',
    boxSizing: 'border-box',
  },
};