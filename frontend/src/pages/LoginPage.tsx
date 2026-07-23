import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('LoginPage');

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    setLoading(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error: err } = await fn(email, password);
    setLoading(false);
    if (err) {
      logger.warn('Auth failed', { mode, error: err.message });
      setError(err.message);
      return;
    }
    if (mode === 'signup') {
      setError('נשלח מייל אימות — בדוק את תיבת הדואר שלך');
      return;
    }
    logger.info('Logged in successfully');
    navigate('/');
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'signup' : 'login');
    setError('');
    setPassword('');
    setConfirm('');
  }

  return (
    <div className="login-root">
      {/* Form panel — first in RTL = right side */}
      <section className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-logo">
            <img src="/logo.png" alt="Giftly" />
          </div>

          <div className="login-header">
            <h1>{mode === 'login' ? 'ברוכים הבאים!' : 'יצירת חשבון חדש'}</h1>
            <p>{mode === 'login' ? 'כיף לראות אתכם שוב' : 'הצטרפו לקהילת Giftly'}</p>
          </div>

          {error && (
            <div className={error.includes('נשלח') ? 'form-success' : 'form-error'}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">כתובת אימייל</label>
              <input
                id="email"
                type="email"
                placeholder="example@giftly.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">סיסמה</label>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="eye-toggle" onClick={() => setShowPassword(s => !s)}>
                  <span className="material-symbols-outlined">{showPassword ? 'visibility' : 'visibility_off'}</span>
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="form-field">
                <label htmlFor="confirm">אימות סיסמה</label>
                <div className="password-wrapper">
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                  <button type="button" className="eye-toggle" onClick={() => setShowConfirm(s => !s)}>
                    <span className="material-symbols-outlined">{showConfirm ? 'visibility' : 'visibility_off'}</span>
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'טוען...' : mode === 'login' ? 'התחברות' : 'יצירת חשבון'}
            </button>
          </form>

          <div className="login-switch">
            {mode === 'login' ? 'עדיין לא רשומים?' : 'כבר יש לך חשבון?'}
            <button onClick={switchMode}>
              {mode === 'login' ? 'יצירת חשבון חדש' : 'כניסה'}
            </button>
          </div>
        </div>
      </section>

      {/* Hero panel — second in RTL = left side */}
      <section className="login-hero">
        <div className="login-hero-text">
          <img src="/logo.png" alt="Giftly" style={{ height: 90, objectFit: 'contain', marginBottom: 28, filter: 'drop-shadow(0 4px 16px rgba(79,70,229,0.25))' }} />
          <h2>הופכים כל מתנה לאישית</h2>
          <p>נהלו את רשימות המתנות שלכם בצורה חכמה ומעוצבת — עם עזרת AI.</p>
        </div>
      </section>
    </div>
  );
}
