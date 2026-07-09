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
    <div className="auth-page">
      <div className="auth-card">
        <h1>🎁 Giftly</h1>
        <h2>{mode === 'login' ? 'כניסה' : 'הרשמה'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="סיסמה"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" className="eye-btn" onClick={() => setShowPassword(s => !s)}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {mode === 'signup' && (
            <div className="password-field">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="אימות סיסמה"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowConfirm(s => !s)}>
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          )}

          {error && <p className={error.includes('נשלח') ? 'success' : 'error'}>{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'טוען...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>
        <button className="link-btn" onClick={switchMode}>
          {mode === 'login' ? 'אין לך חשבון? הרשמה' : 'כבר יש לך חשבון? כניסה'}
        </button>
      </div>
    </div>
  );
}
