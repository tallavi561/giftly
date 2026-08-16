import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('GroupsPage');

interface GroupRow { id: string; name: string; role: 'owner' | 'member'; created_at: string }
interface PendingInvite { id: string; group_id: string; groups?: { name: string }; inviter_name: string | null }

// Groups list — spec §9.1 in Specs/Front/FRONTEND_SPEC2.md.
export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [responding, setResponding] = useState<string | null>(null);

  function load() {
    return Promise.all([api.groups.list(), api.groupInvites.pending()]).then(([g, p]) => {
      setGroups(g);
      setPending(p);
    }).catch(err => logger.error('Load groups failed', err));
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await api.groups.create(name.trim());
      logger.info('Group created', { id: created.id });
      setShowForm(false);
      setName('');
      navigate(`/groups/${created.id}`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function respond(invite: PendingInvite, action: 'ACCEPT' | 'DECLINE') {
    setResponding(invite.id);
    try {
      await api.groupInvites.respond(invite.id, action);
      setPending(p => p.filter(x => x.id !== invite.id));
      if (action === 'ACCEPT') load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResponding(null);
    }
  }

  return (
    <>
      <div className="page-heading" style={{ marginBottom: 0 }}>
        <h1 style={{ fontSize: 28 }}>קבוצות</h1>
        <p>ארגון אנשי קשר לקבוצות, לשיתוף אירועים בעתיד</p>
      </div>

      {pending.length > 0 && (
        <div className="requests-section">
          <p className="requests-title">
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 18 }}>groups</span>
            הזמנות ממתינות ({pending.length})
          </p>
          {pending.map(inv => (
            <div key={inv.id} className="request-card">
              <div>
                <p className="req-name">{inv.groups?.name ?? 'קבוצה'}</p>
                <p className="req-sub">{inv.inviter_name ? `הוזמנת ע"י ${inv.inviter_name}` : 'הוזמנת להצטרף'}</p>
              </div>
              <div className="request-actions">
                <button className="btn-icon-sm approve" disabled={responding === inv.id} onClick={() => respond(inv, 'ACCEPT')} title="הצטרף">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                </button>
                <button className="btn-icon-sm reject" disabled={responding === inv.id} onClick={() => respond(inv, 'DECLINE')} title="דחה">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn-fab" onClick={() => setShowForm(true)} title="קבוצה חדשה">
        <span className="material-symbols-outlined">add</span>
      </button>

      {loading ? (
        <p style={{ color: 'var(--on-surface-variant)', marginTop: 32 }}>טוען...</p>
      ) : groups.length === 0 && pending.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">groups</span>
          עדיין אין קבוצות. לחץ על "+" כדי ליצור אחת.
        </div>
      ) : (
        <div className="contacts-list" style={{ marginTop: 20 }}>
          {groups.map(g => (
            <div key={g.id} className="contact-list-item" onClick={() => navigate(`/groups/${g.id}`)}>
              <div className="contact-list-main">
                <div className="contact-list-avatar" style={{ background: 'var(--primary-fixed)', color: 'var(--primary)' }}>
                  <span className="material-symbols-outlined">groups</span>
                </div>
                <h3 className="contact-list-name">{g.name}</h3>
              </div>
              <span className="contact-list-badge">{g.role === 'owner' ? 'הקמת' : 'חבר'}</span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', marginLeft: 8, fontSize: 22 }}>group_add</span>
              קבוצה חדשה
            </h3>
            <form onSubmit={createGroup} className="fields-stack">
              <div className="field">
                <label>שם הקבוצה *</label>
                <input placeholder="לדוגמה: המשפחה" value={name} onChange={e => setName(e.target.value)} required autoFocus />
              </div>
              <div className="form-row-btns">
                <button type="submit" className="btn-filled">צור</button>
                <button type="button" className="btn-surface" onClick={() => setShowForm(false)}>ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
