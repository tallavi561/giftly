import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import { useAuth } from '../context/AuthContext.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import InterestPicker from '../components/InterestPicker.js';
import AvatarPicker, { type AvatarMode } from '../components/AvatarPicker.js';

const logger = new Logger('SetupPage');

const PRIVACY_OPTIONS = [
  {
    value: 'public',
    icon: 'public',
    label: 'ציבורי',
    desc: 'כולם יכולים למצוא ולשמור אותך',
  },
  {
    value: 'approval',
    icon: 'group',
    label: 'מחייב אישור (מומלץ)',
    desc: 'כל בקשה מחייבת את אישורך',
  },
  {
    value: 'password',
    icon: 'lock',
    label: 'מוגן סיסמה',
    desc: 'רק מי שיודע את הסיסמה יוכל לשמור אותך',
  },
];

const GENDER_OPTIONS = [
  { value: 'female', label: 'אישה' },
  { value: 'male',   label: 'גבר' },
  { value: 'other',  label: 'אחר' },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    display_name: '', nickname: '', interests: [] as string[], bio: '',
    gender: '', birth_date: '', city: '', country: '',
    privacy_level: 'approval', privacy_password: '', privacy_password_confirm: '',
    avatar_mode: 'illustrated' as AvatarMode, avatar_url: null as string | null,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (form.privacy_level === 'password') {
      if (!form.privacy_password) { setError('יש להגדיר קוד גישה'); return; }
      if (form.privacy_password !== form.privacy_password_confirm) { setError('קודי הגישה אינם תואמים'); return; }
    }
    setLoading(true);
    try {
      await api.userProfile.create({
        display_name: form.display_name,
        nickname: form.nickname.trim().toLowerCase(),
        gender: form.gender || null,
        interests: form.interests,
        bio: form.bio || null,
        birth_date: form.birth_date || null,
        city: form.city || null,
        country: form.country || null,
        privacy_level: form.privacy_level,
        privacy_password: form.privacy_level === 'password' ? form.privacy_password : undefined,
        avatar_mode: form.avatar_mode,
        avatar_url: form.avatar_url,
      });
      logger.info('User profile created');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-card-header">
          <h1>ברוכים הבאים ל-Giftly</h1>
          <p>בואו נכיר אתכם קצת יותר כדי שנוכל להציע את המתנות המושלמות.</p>
        </div>

        <div className="setup-card-body">
          <form onSubmit={handleSubmit} className="fields-stack">

            <section className="setup-section ai-border">
              <h2 className="setup-section-title accent">תמונת פרופיל</h2>
              <AvatarPicker
                mode={form.avatar_mode}
                url={form.avatar_url}
                name={form.display_name || 'א'}
                gender={form.gender}
                birthDate={form.birth_date}
                uploadPathPrefix={`${user?.id}/self`}
                onChange={(mode, url) => setForm(f => ({ ...f, avatar_mode: mode, avatar_url: url }))}
              />
            </section>

            <section className="setup-section">
              <h2 className="setup-section-title">פרטים בסיסיים</h2>
              <div className="fields-row">
                <div className="field">
                  <label>שם מלא *</label>
                  <input
                    placeholder="לדוגמה: ישראל ישראלי"
                    value={form.display_name}
                    onChange={e => setField('display_name', e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>כינוי ייחודי *</label>
                  <input
                    placeholder="@username"
                    value={form.nickname}
                    onChange={e => setField('nickname', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>מגדר</label>
                <div className="gender-pills">
                  {GENDER_OPTIONS.map(g => (
                    <button
                      key={g.value}
                      type="button"
                      className={`gender-pill${form.gender === g.value ? ' selected' : ''}`}
                      onClick={() => setField('gender', form.gender === g.value ? '' : g.value)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="setup-section">
              <h2 className="setup-section-title">מיקום ותקציר</h2>
              <LocationBirthFields
                birth_date={form.birth_date}
                city={form.city}
                country={form.country}
                onChange={setField}
              />
              <div className="field">
                <label>קצת עליי (Bio)</label>
                <textarea
                  placeholder="ספר/י לנו על עצמך..."
                  value={form.bio}
                  onChange={e => setField('bio', e.target.value)}
                  rows={3}
                />
              </div>
            </section>

            <section className="setup-section ai-border">
              <h2 className="setup-section-title accent">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--heritage-gold)' }}>auto_awesome</span>
                תחומי עניין
              </h2>
              <p className="setup-section-hint">נוסיף תחומי עניין כדי שה-AI שלנו יוכל להציע מתנות מדויקות יותר.</p>
              <InterestPicker
                value={form.interests}
                onChange={tags => setForm(f => ({ ...f, interests: tags }))}
              />
            </section>

            <section className="setup-section privacy-box">
              <h2 className="setup-section-title">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>lock</span>
                הגדרות פרטיות פרופיל
              </h2>
              <div className="privacy-selector">
                {PRIVACY_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`privacy-option${form.privacy_level === opt.value ? ' selected' : ''}`}
                    onClick={() => setField('privacy_level', opt.value)}
                  >
                    <div className="radio-dot" />
                    <input type="radio" name="privacy_level" value={opt.value} checked={form.privacy_level === opt.value} onChange={() => {}} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>{opt.icon}</span>
                        <strong>{opt.label}</strong>
                      </div>
                      <span>{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              {form.privacy_level === 'password' && (
                <div className="fields-row" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>קוד גישה</label>
                    <input type="password" placeholder="הגדר קוד" value={form.privacy_password} onChange={e => setField('privacy_password', e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>אימות קוד</label>
                    <input type="password" placeholder="חזור על הקוד" value={form.privacy_password_confirm} onChange={e => setField('privacy_password_confirm', e.target.value)} required />
                  </div>
                </div>
              )}
            </section>

            {error && <p className="error">{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-filled" disabled={loading} style={{ padding: '14px 32px', fontSize: '16px', borderRadius: 'var(--r-full)' }}>
                {loading ? 'שומר...' : 'כניסה לאפליקציה'}
                {!loading && <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>arrow_back</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
