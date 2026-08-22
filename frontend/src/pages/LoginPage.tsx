import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('LoginPage');

export default function LoginPage() {
  const { signIn, signUp, signOut, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    setLoading(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { data, error: err } = await fn(email, password);
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
    if (data.user && !data.user.email_confirmed_at) {
      logger.warn('Sign-in blocked: email not confirmed', { userId: data.user.id });
      await signOut();
      setError('יש לאשר את כתובת המייל לפני ההתחברות — בדוק את תיבת הדואר שלך');
      return;
    }
    logger.info('Logged in successfully');
    navigate('/');
  }

  async function handleForgotPassword() {
    if (!email) { setError('הזן קודם את כתובת האימייל שלך למעלה'); return; }
    setError('');
    const { error: err } = await resetPassword(email);
    setError(err ? err.message : 'נשלח אליך מייל לאיפוס הסיסמה');
  }

  return (
    <div className="login-root">
      <main className="login-card">
        <div className="login-card-header-glow" />
        <div className="login-card-body">
          <div className="login-logo">
            <img src="/logo-wordmark.png" alt="Giftly" />
          </div>

          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab${mode === 'login' ? ' active' : ''}`}
              onClick={() => switchMode('login')}
            >
              התחברות
            </button>
            <button
              type="button"
              className={`login-tab${mode === 'signup' ? ' active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              הרשמה
            </button>
          </div>

          {error && (
            <div className={error.includes('נשלח') ? 'form-success' : 'form-error'}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">דואר אלקטרוני</label>
              <input
                id="email"
                type="email"
                placeholder="הכנס אימייל"
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
                  placeholder="הכנס סיסמה"
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
                    placeholder="חזור על הסיסמה"
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

            {mode === 'login' && (
              <div className="login-forgot">
                <button type="button" onClick={handleForgotPassword}>שכחתי סיסמה?</button>
              </div>
            )}

            <button type="submit" className="login-submit-btn" disabled={loading}>
              <span className="material-symbols-outlined">{mode === 'login' ? 'login' : 'person_add'}</span>
              {loading ? 'טוען...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
