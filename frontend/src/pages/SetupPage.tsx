import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import TagInput from '../components/TagInput.js';

const logger = new Logger('SetupPage');

const PRIVACY_OPTIONS = [
  { value: 'public',   label: '🔓 פתוח',       desc: 'כל אחד יוכל למצוא אותך ולהוסיף אותך כאיש קשר.' },
  { value: 'approval', label: '✋ מחייב אישור', desc: 'ברירת מחדל — מי שרוצה לעקוב אחרייך יצטרך את אישורך.' },
  { value: 'password', label: '🔑 סיסמה',       desc: 'מי שרוצה לשמור אותך יצטרך להזין קוד גישה שתגדיר.' },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    display_name: '', nickname: '', interests: [] as string[], bio: '',
    birth_date: '', city: '', country: '',
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
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 500 }}>
        <h1>🎁 Giftly</h1>
        <h2>ספר לנו קצת עליך</h2>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 8 }}>
          הפרטים שלך יעזרו למערכת להציע מתנות מדויקות יותר לכולם.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="השם שלך"
            value={form.display_name}
            onChange={e => setField('display_name', e.target.value)}
            required
          />
          <div>
            <input
              placeholder="כינוי ייחודי (לדוגמה: david_cohen)"
              value={form.nickname}
              onChange={e => setField('nickname', e.target.value.toLowerCase().replace(/\s/g, '_'))}
              required
            />
            <p style={{ color: '#999', fontSize: '0.8rem', marginTop: 4, marginBottom: 0 }}>
              הכינוי הוא הדרך שבה אחרים יוכלו למצוא אותך — בחר משהו קבוע וייחודי.
            </p>
          </div>
          <LocationBirthFields
            birth_date={form.birth_date}
            city={form.city}
            country={form.country}
            onChange={setField}
          />
          <TagInput
            value={form.interests}
            onChange={tags => setForm(f => ({ ...f, interests: tags }))}
            placeholder="תחומי עניין שלך (הקלד ולחץ פסיק)"
          />
          <textarea
            placeholder="ספר על עצמך — מה אתה אוהב, מה מעניין אותך, סגנון חיים..."
            value={form.bio}
            onChange={e => setField('bio', e.target.value)}
            rows={3}
          />

          {/* בחירת רמת פרטיות */}
          <div className="privacy-selector">
            <p className="privacy-label">מי יכול למצוא ולשמור אותך?</p>
            {PRIVACY_OPTIONS.map(opt => (
              <label key={opt.value} className={`privacy-option ${form.privacy_level === opt.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="privacy_level"
                  value={opt.value}
                  checked={form.privacy_level === opt.value}
                  onChange={() => setField('privacy_level', opt.value)}
                />
                <div>
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          {form.privacy_level === 'password' && (
            <>
              <input
                type="password"
                placeholder="הגדר קוד גישה"
                value={form.privacy_password}
                onChange={e => setField('privacy_password', e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="אמת קוד גישה"
                value={form.privacy_password_confirm}
                onChange={e => setField('privacy_password_confirm', e.target.value)}
                required
              />
            </>
          )}

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'שומר...' : 'התחל להשתמש'}
          </button>
        </form>
      </div>
    </div>
  );
}
