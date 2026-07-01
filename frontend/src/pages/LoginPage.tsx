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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>🎁 Giftly</h1>
        <h2>{mode === 'login' ? 'כניסה' : 'הרשמה'}</h2>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="אימייל" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="סיסמה" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'טוען...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'אין לך חשבון? הרשמה' : 'כבר יש לך חשבון? כניסה'}
        </button>
      </div>
    </div>
  );
}
