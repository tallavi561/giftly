import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import TagInput from '../components/TagInput.js';
import GenderSelect from '../components/GenderSelect.js';

export default function ProfilePage() {
  const navigate = useNavigate();
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
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <img src="/logo.png" alt="Giftly" />
          </div>
          <div className="top-bar-actions">
            <button className="btn-surface" onClick={() => navigate('/')} style={{ gap: 6, display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              חזרה
            </button>
          </div>
        </div>
      </header>

      <div className="profile-page-body">
        <div className="profile-page-card">
          <div className="profile-page-header">
            <span className="material-symbols-outlined profile-page-icon">account_circle</span>
            <div>
              <h1>הפרופיל שלי</h1>
              <p>עדכן את הפרטים האישיים שלך</p>
            </div>
          </div>

          {loading ? (
            <div className="ai-loader" style={{ paddingTop: 48 }}>
              <div className="ai-loader-dots"><span /><span /><span /></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="profile-edit-form">
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

              <div className="fields-row">
                <div className="field">
                  <label>תאריך לידה</label>
                  <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
                </div>
                <div className="field">
                  <label>עיר</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="תל אביב" />
                </div>
                <div className="field">
                  <label>מדינה</label>
                  <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="ישראל" />
                </div>
              </div>

              <div className="field">
                <label>תחביבים ותחומי עניין</label>
                <TagInput value={form.interests} onChange={v => set('interests', v)} placeholder="ספורט, מוזיקה, בישול..." />
              </div>

              <div className="field">
                <label>ביו</label>
                <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} placeholder="כמה מילים על עצמך..." />
              </div>

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
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
                <button type="button" className="btn-surface" onClick={() => navigate('/')}>ביטול</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
