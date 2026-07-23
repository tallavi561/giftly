import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import TagInput from '../components/TagInput.js';

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
  const [form, setForm] = useState({
    display_name: '', nickname: '', interests: [] as string[], bio: '',
    gender: '', birth_date: '', city: '', country: '',
    privacy_level: 'approval', privacy_password: '', privacy_password_confirm: '',
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
          <img src="/logo.png" alt="Giftly" className="logo" />
          <h1>בואו נכיר קצת יותר</h1>
          <p>כדי שנוכל לעזור לך להפוך כל מתנה למשמעותית — נשמח לכמה פרטים.</p>
        </div>

        <div className="setup-card-body">
          <form onSubmit={handleSubmit} className="fields-stack">

            <div className="fields-row">
              <div className="field">
                <label>שם מלא</label>
                <input
                  placeholder="למשל: דניאל לוי"
                  value={form.display_name}
                  onChange={e => setField('display_name', e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>כינוי ייחודי</label>
                <input
                  placeholder="daniel_levy"
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

            <div className="field">
              <label>תחומי עניין</label>
              <TagInput
                value={form.interests}
                onChange={tags => setForm(f => ({ ...f, interests: tags }))}
                placeholder="הקלד ולחץ פסיק — טכנולוגיה, בישול..."
              />
            </div>

            <LocationBirthFields
              birth_date={form.birth_date}
              city={form.city}
              country={form.country}
              onChange={setField}
            />

            <div className="field">
              <label>ספר על עצמך (אופציונלי)</label>
              <textarea
                placeholder="מה אתה אוהב, מה מעניין אותך..."
                value={form.bio}
                onChange={e => setField('bio', e.target.value)}
                rows={3}
              />
            </div>

            <div className="field">
              <label>מי יכול לשמור אותך כאיש קשר?</label>
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
            </div>

            {form.privacy_level === 'password' && (
              <div className="fields-row">
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

            {error && <p className="error">{error}</p>}

            <button type="submit" className="btn-filled" disabled={loading} style={{ padding: '14px', fontSize: '16px', marginTop: 8 }}>
              {loading ? 'שומר...' : 'שמירה והתחלה'}
              {!loading && <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>arrow_back</span>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
