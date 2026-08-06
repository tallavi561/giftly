import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Avatar from './Avatar.js';

export type AvatarMode = 'illustrated' | 'silhouette' | 'photo';

interface Props {
  mode: AvatarMode;
  url: string | null;
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  /** Storage path prefix, unique per owner + target, e.g. `${userId}/self` or `${userId}/contact-${contactId}` */
  uploadPathPrefix: string;
  onChange: (mode: AvatarMode, url: string | null) => void;
}

const DESCRIPTIONS: Record<AvatarMode, string> = {
  photo: 'בחר תמונה מהגלריה שלך',
  illustrated: 'אווטאר מאויר וחמוד על סמך הפרטים שהזנת',
  silhouette: 'אייקון גנרי, ללא תמונה אישית',
};

const OPTIONS: { mode: AvatarMode; icon: string; label: string }[] = [
  { mode: 'photo', icon: 'add_photo_alternate', label: 'העלאה' },
  { mode: 'illustrated', icon: 'auto_awesome', label: 'מאויר' },
  { mode: 'silhouette', icon: 'person', label: 'צללית' },
];

export default function AvatarPicker({ mode, url, name, gender, birthDate, uploadPathPrefix, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${uploadPathPrefix}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      onChange('photo', `${data.publicUrl}?t=${Date.now()}`);
    } catch (err) {
      setError('העלאת התמונה נכשלה: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function selectMode(next: AvatarMode) {
    if (next === 'photo') {
      fileInputRef.current?.click();
      return;
    }
    onChange(next, null);
  }

  return (
    <div className="avatar-picker">
      <input ref={fileInputRef} type="file" accept="image/*" className="avatar-picker-file-input" onChange={handleFileChange} />
      <div className="avatar-picker-row">
        {OPTIONS.map(opt => {
          const selected = mode === opt.mode;
          return (
            <button
              type="button"
              key={opt.mode}
              className={`avatar-picker-option${selected ? ' selected' : ''}`}
              onClick={() => selectMode(opt.mode)}
              disabled={uploading}
            >
              <div className="avatar-picker-circle">
                {selected && mode === 'photo' && url ? (
                  <Avatar name={name} gender={gender} birthDate={birthDate} avatarMode="photo" avatarUrl={url} size={64} />
                ) : selected && mode === 'illustrated' ? (
                  <Avatar name={name} gender={gender} birthDate={birthDate} avatarMode="illustrated" size={64} />
                ) : (
                  <span className="material-symbols-outlined">{opt.icon}</span>
                )}
              </div>
              <span className="avatar-picker-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      <p className="avatar-picker-desc">{uploading ? 'מעלה תמונה...' : DESCRIPTIONS[mode]}</p>
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
