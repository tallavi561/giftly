import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('SetupPage');

export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ display_name: '', nickname: '', interests: '', bio: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.userProfile.create({
        display_name: form.display_name,
        nickname: form.nickname.trim().toLowerCase(),
        interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
        bio: form.bio || null,
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
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <h1>🎁 Giftly</h1>
        <h2>ספר לנו קצת עליך</h2>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 8 }}>
          הפרטים שלך יעזרו למערכת להציע מתנות מדויקות יותר לכולם.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="השם שלך"
            value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            required
          />

          <div>
            <input
              placeholder="כינוי ייחודי (לדוגמה: david_cohen)"
              value={form.nickname}
              onChange={e => setForm(f => ({ ...f, nickname: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
              required
            />
            <p style={{ color: '#999', fontSize: '0.8rem', marginTop: 4, marginBottom: 0 }}>
              הכינוי הוא הדרך שבה אחרים יוכלו למצוא אותך במאגר — בחר משהו קבוע וייחודי.
            </p>
          </div>

          <input
            placeholder="תחומי עניין שלך (מופרדים בפסיק)"
            value={form.interests}
            onChange={e => setForm(f => ({ ...f, interests: e.target.value }))}
          />

          <textarea
            placeholder="ספר על עצמך — מה אתה אוהב, מה מעניין אותך, סגנון חיים..."
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            rows={3}
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'שומר...' : 'התחל להשתמש'}
          </button>
        </form>
      </div>
    </div>
  );
}
