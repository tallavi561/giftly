import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import InterestPicker from '../components/InterestPicker.js';
import GenderSelect from '../components/GenderSelect.js';
import ContactProfileFields from '../components/ContactProfileFields.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import AvatarPicker, { type AvatarMode } from '../components/AvatarPicker.js';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.userProfile.me().then(p => {
      setForm({
        display_name: p.display_name ?? '',
        nickname: p.nickname ?? '',
        bio: p.bio ?? '',
        gender: p.gender ?? '',
        birth_date: p.birth_date ?? '',
        city: p.city ?? '',
        country: p.country ?? '',
        interests: p.interests ?? [],
        privacy_level: p.privacy_level ?? 'approval',
        relationship_status: p.relationship_status ?? '',
        has_children: p.has_children === true ? 'true' : p.has_children === false ? 'false' : '' as '' | 'true' | 'false',
        religion: p.religion ?? '',
        avatar_mode: (p.avatar_mode ?? 'illustrated') as AvatarMode,
        avatar_url: p.avatar_url ?? null,
      });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.userProfile.update({
        display_name: form.display_name,
        nickname: form.nickname.trim().toLowerCase(),
        bio: form.bio || null,
        gender: form.gender || null,
        birth_date: form.birth_date || null,
        city: form.city || null,
        country: form.country || null,
        interests: form.interests,
        privacy_level: form.privacy_level,
        relationship_status: form.relationship_status || null,
        has_children: form.has_children === 'true' ? true : form.has_children === 'false' ? false : null,
        religion: form.religion || null,
        avatar_mode: form.avatar_mode,
        avatar_url: form.avatar_url,
      });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }));
  }

  return (
    <>
      <div className="profile-page-body">
        <div className="profile-page-wrap">
          <div className="profile-page-heading">
            <h1>עריכת פרופיל</h1>
            <p>עדכן את הפרטים האישיים שלך כדי לשפר את החוויה</p>
          </div>

          <div className="profile-page-card">
            {loading ? (
              <div className="ai-loader" style={{ paddingTop: 48 }}>
                <div className="ai-loader-dots"><span /><span /><span /></div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="profile-edit-form">
                <AvatarPicker
                  mode={form.avatar_mode}
                  url={form.avatar_url}
                  name={form.display_name || 'א'}
                  gender={form.gender}
                  birthDate={form.birth_date}
                  uploadPathPrefix={`${user?.id}/self`}
                  onChange={(mode, url) => setForm(f => ({ ...f, avatar_mode: mode, avatar_url: url }))}
                />

                <div className="fields-row">
                  <div className="field">
                    <label>שם מלא</label>
                    <input value={form.display_name} onChange={e => set('display_name', e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>כינוי (מזהה ייחודי)</label>
                    <input value={form.nickname} onChange={e => set('nickname', e.target.value)} required placeholder="@username" />
                  </div>
                </div>

                <div className="field">
                  <label>מגדר</label>
                  <GenderSelect value={form.gender} onChange={v => set('gender', v)} />
                </div>

                <LocationBirthFields
                  birth_date={form.birth_date}
                  city={form.city}
                  country={form.country}
                  onChange={(field, value) => set(field, value)}
                />

                <div className="field">
                  <label>תחביבים ותחומי עניין</label>
                  <InterestPicker value={form.interests} onChange={v => set('interests', v)} />
                </div>

                <div className="field">
                  <label>קצת עליי (Bio)</label>
                  <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} placeholder="כמה מילים על עצמך..." />
                </div>

                <ContactProfileFields
                  relationship_status={form.relationship_status ?? ''}
                  has_children={form.has_children ?? ''}
                  religion={form.religion ?? ''}
                  onChange={(field, value) => set(field, value)}
                />

                <div className="field">
                  <label>רמת פרטיות</label>
                  <div className="privacy-selector">
                    {(['public', 'approval', 'password'] as const).map(level => (
                      <label
                        key={level}
                        className={`privacy-option${form.privacy_level === level ? ' selected' : ''}`}
                        onClick={() => set('privacy_level', level)}
                      >
                        <div className="radio-dot" />
                        <input type="radio" name="pp" value={level} checked={form.privacy_level === level} onChange={() => {}} />
                        <div>
                          <strong>{level === 'public' ? 'פתוח' : level === 'approval' ? 'מחייב אישור' : 'סיסמה'}</strong>
                          <span>{level === 'public' ? 'כולם יכולים לשמור אותך' : level === 'approval' ? 'כל בקשה מחייבת אישורך' : 'רק עם קוד גישה'}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {error && <p className="error-msg">{error}</p>}

                <div className="form-row-btns" style={{ marginTop: 8 }}>
                  <button type="submit" className="btn-filled" disabled={saving}>
                    {saving ? 'שומר...' : 'שמירת שינויים'}
                  </button>
                  <button type="button" className="btn-surface" onClick={() => navigate('/')}>ביטול</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
