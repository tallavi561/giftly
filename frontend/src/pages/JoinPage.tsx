import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('JoinPage');

// POST /api/join/:token landing page — handles both invite_links target
// types (spec §14.2). Reached only while signed in (protected route, like
// every other page inside the shell) — a not-yet-registered visitor is
// expected to sign up first, per the spec's own note that this flow assumes
// a registered clicker.
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'joining' | 'error'>('joining');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    api.join(token).then(result => {
      if (result.target_type === 'GROUP') navigate('/groups', { replace: true });
      else navigate('/contacts', { replace: true });
    }).catch(err => {
      logger.error('Join failed', err);
      setStatus('error');
      setMessage((err as Error).message || 'הקישור לא תקין או שפג תוקפו');
    });
  }, [token, navigate]);

  return (
    <div className="loading">
      {status === 'joining' ? <p>מצטרף...</p> : <p>{message}</p>}
    </div>
  );
}
