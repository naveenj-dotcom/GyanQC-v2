import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const DEFAULT_OVERLAY_URL = '/default-overlay.png';

export default function OverlaySettingsModal({ currentOverlayUrl, onSaved, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(currentOverlayUrl || DEFAULT_OVERLAY_URL);
  const [urlInput, setUrlInput] = useState(
    currentOverlayUrl && !currentOverlayUrl.startsWith('data:') ? currentOverlayUrl : ''
  );
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
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
    setSaving(true);

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

    setSaving(false);
    if (error) {
      alert('Failed to save overlay image: ' + error.message);
      return;
    }

    onSaved(finalUrl);
    onClose();
  };

  const handleResetDefault = () => {
    setPreviewUrl(DEFAULT_OVERLAY_URL);
    setUrlInput('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>
              Video Player Overlay Image
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Changes the safe-zone overlay across all Admin, QCstar, and Creator video players.
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ✕ Close
          </button>
        </div>

        <div style={styles.bodyGrid}>
          <div style={styles.controlsCol}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg,image/svg+xml"
              hidden
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
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
                disabled={saving}
                onClick={handleSaveOverlay}
                className="primary-button"
                style={{ flex: 1 }}
              >
                {saving ? 'Saving Globally...' : '✓ Save Overlay for All Players'}
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="secondary-button"
              >
                Reset to Default
              </button>
            </div>
          </div>

          <div style={styles.previewCol}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>
              LIVE 9:16 SAFE-ZONE PREVIEW
            </span>
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
    marginBottom: '18px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '14px',
  },
  closeBtn: {
    background: '#f1f5f9',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
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
};