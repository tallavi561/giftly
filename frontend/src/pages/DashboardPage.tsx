import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, ContactRequest, Recommendation, UserProfile } from '../types/index.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import TagInput from '../components/TagInput.js';
import GenderSelect from '../components/GenderSelect.js';


const logger = new Logger('DashboardPage');

const EMPTY_FORM = { name: '', relationship: '', interests: [] as string[], free_text: '', notes: '', gender: '', birth_date: '', city: '', country: '' };

const PRIVACY_BADGE: Record<string, string> = { public: '🔓', approval: '✋', password: '🔑' };
const PRIVACY_ICON: Record<string, string> = { public: 'public', approval: 'pan_tool', password: 'lock' };

function avatarLetter(name: string) { return name?.trim()?.[0] ?? '?'; }

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [linkedUser, setLinkedUser] = useState<UserProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [privacyPassword, setPrivacyPassword] = useState('');
  const [pendingPrivacy, setPendingPrivacy] = useState<'password' | null>(null);

  const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Recommendation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);


  useEffect(() => {
    Promise.all([
      api.contacts.list(),
      api.contactRequests.incoming().catch(() => []),
      api.contactRequests.outgoing().catch(() => []),
    ]).then(([c, inc, out]: any[]) => {
      logger.info('Dashboard loaded');
      setContacts(c);
      setIncomingRequests(inc);
      setOutgoingRequests(out);
      setLoading(false);
    }).catch(err => {
      logger.error('Dashboard load failed', err);
      setLoading(false);
    });
  }, []);

  async function openHistory() {
    setShowHistory(true);
    if (history.length === 0) {
      setHistoryLoading(true);
      const recs = await api.recommendations.list();
      setHistory(recs);
      setHistoryLoading(false);
    }
  }

  async function handleSearch() {
    if (searchQuery.length < 2) return;
    setSearching(true);
    const results = await api.userProfile.search(searchQuery);
    setSearchResults(results);
    setSearching(false);
  }

  function selectLinkedUser(u: UserProfile) {
    setLinkedUser(u);
    setForm(f => ({ ...f, name: u.display_name, interests: u.interests ?? [] }));
    setSearchResults([]);
    setSearchQuery('');
    setPrivacyPassword('');
    setPendingPrivacy(u.privacy_level === 'password' ? 'password' : null);
  }

  async function createContact(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: linkedUser ? linkedUser.display_name : form.name,
      relationship: form.relationship || null,
      linked_user_id: linkedUser?.user_id ?? null,
      interests: form.interests,
      free_text: form.free_text || null,
      notes: form.notes || null,
      gender: form.gender || null,
      birth_date: form.birth_date || null,
      city: form.city || null,
      country: form.country || null,
    };
    if (linkedUser?.privacy_level === 'password') payload.privacy_password = privacyPassword;
    try {
      const result: any = await api.contacts.create(payload);
      if (result?.status === 'pending_approval') {
        const fakeReq: ContactRequest = {
          id: Math.random().toString(),
          requester_id: user!.id,
          requester_name: null,
          target_user_id: linkedUser!.user_id,
          status: 'pending',
          created_at: new Date().toISOString(),
          target_profile: { display_name: linkedUser!.display_name, nickname: linkedUser!.nickname },
        };
        setOutgoingRequests(r => [fakeReq, ...r]);
        setShowForm(false);
        setForm(EMPTY_FORM);
        setLinkedUser(null);
        alert(`בקשת מעקב נשלחה ל-${linkedUser!.display_name}. תקבל אישור לאחר שהם יאשרו.`);
        return;
      }
      logger.info('Contact created', { id: result.id });
      setContacts(c => [...c, result]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setLinkedUser(null);
      navigate(`/contact/${result.id}?newContact=true`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function approveRequest(req: ContactRequest) {
    await api.contactRequests.approve(req.id, req.requester_name ?? 'ללא שם', null);
    setIncomingRequests(r => r.filter(x => x.id !== req.id));
  }

  async function rejectRequest(req: ContactRequest) {
    await api.contactRequests.reject(req.id);
    setIncomingRequests(r => r.filter(x => x.id !== req.id));
  }

  function openForm() {
    setShowForm(true);
    setLinkedUser(null);
    setForm(EMPTY_FORM);
    setSearchQuery('');
    setSearchResults([]);
    setPrivacyPassword('');
    setPendingPrivacy(null);
  }

  const pendingOut = outgoingRequests.filter(r => r.status === 'pending');

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <img src="/logo.png" alt="Giftly" />
          </div>
          <div className="top-bar-actions">
            <button className="icon-btn" onClick={() => navigate('/profile')} title="הפרופיל שלי">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button className="icon-btn" onClick={openHistory} title="היסטוריה">
              <span className="material-symbols-outlined">history</span>
            </button>
            <button className="btn-signout" onClick={signOut}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 4 }}>logout</span>
              יציאה
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        {/* Side Nav */}
        <nav className="side-nav">
          <div className="side-nav-item active">
            <span className="material-symbols-outlined icon-fill">contacts</span>
            אנשי קשר
          </div>
          <div className="side-nav-item" onClick={() => navigate('/my-gifts')}>
            <span className="material-symbols-outlined">favorite</span>
            המתנות שלי
          </div>
          <div className="side-nav-item" style={{ cursor: 'default', opacity: 0.5 }}>
            <span className="material-symbols-outlined">calendar_today</span>
            לוח שנה
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          {/* Requests */}
          {incomingRequests.length > 0 && (
            <div className="requests-section">
              <p className="requests-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 18 }}>notifications_active</span>
                בקשות ממתינות לאישורך ({incomingRequests.length})
              </p>
              {incomingRequests.map(r => (
                <div key={r.id} className="request-card">
                  <div>
                    <p className="req-name">{(r as any).requester?.display_name ?? r.requester_name ?? 'משתמש'}</p>
                    <p className="req-sub">רוצה להוסיף אותך כאיש קשר</p>
                  </div>
                  <div className="request-actions">
                    <button className="btn-icon-sm approve" onClick={() => approveRequest(r)} title="אשר">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                    </button>
                    <button className="btn-icon-sm reject" onClick={() => rejectRequest(r)} title="דחה">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pendingOut.length > 0 && (
            <div className="requests-section">
              <p className="requests-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--outline)', fontSize: 18 }}>hourglass_empty</span>
                בקשות שלחת — ממתינות לאישור
              </p>
              {pendingOut.map(r => (
                <div key={r.id} className="request-card pending-out">
                  <div>
                    <p className="req-name">{r.target_profile?.display_name ?? 'משתמש'}</p>
                    <p className="req-sub">ממתין לאישור{r.target_profile?.nickname ? ` (@${r.target_profile.nickname})` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Header + Add button */}
          <div className="section-actions">
            <div className="page-heading" style={{ marginBottom: 0 }}>
              <h1 style={{ fontSize: 28 }}>אנשי הקשר שלי</h1>
              <p>אירועים קרובים ששווה להתכונן אליהם</p>
            </div>
            <button className="btn-fab" onClick={openForm}>
              <span className="material-symbols-outlined">add</span>
              הוסף איש קשר
            </button>
          </div>

          {/* Contacts grid */}
          {loading ? (
            <p style={{ color: 'var(--on-surface-variant)', marginTop: 32 }}>טוען...</p>
          ) : contacts.length === 0 && !showForm ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">people</span>
              אין עדיין אנשי קשר. לחץ על "הוסף איש קשר" כדי להתחיל.
            </div>
          ) : (
            <div className="contacts-grid">
              {contacts.map(c => {
                const name = (c.user_profile as any)?.display_name ?? c.name;
                const gender = (c.user_profile as any)?.gender ?? c.gender;
                return (
                  <div key={c.id} className="contact-card" onClick={() => navigate(`/contact/${c.id}`)}>
                    <div className="contact-avatar">{avatarLetter(name)}</div>
                    <h3>{name}</h3>
                    {c.relationship && <p className="rel">{c.relationship}</p>}
                    {gender && (
                      <p className="gender-chip">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>
                        {gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : 'אחר'}
                      </p>
                    )}
                    {c.user_profile && (
                      <p className="linked-badge">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{PRIVACY_ICON[(c.user_profile as any).privacy_level] ?? 'link'}</span>
                        @{(c.user_profile as any).nickname}
                      </p>
                    )}
                    {(c.interests?.length > 0) && (
                      <div className="tags">
                        {c.interests.slice(0, 3).map(i => <span key={i} className="tag">{i}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        <div className="mobile-nav-item active">
          <span className="material-symbols-outlined icon-fill">contacts</span>
          אנשי קשר
        </div>
        <div className="mobile-nav-item" onClick={openHistory}>
          <span className="material-symbols-outlined">history</span>
          היסטוריה
        </div>
        <div className="mobile-nav-item" onClick={() => navigate('/profile')}>
          <span className="material-symbols-outlined">account_circle</span>
          פרופיל
        </div>
      </nav>

      {/* Add Contact Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', marginLeft: 8, fontSize: 22 }}>person_add</span>
              איש קשר חדש
            </h3>
            <form onSubmit={createContact} className="fields-stack">
              {/* Search linked user */}
              {!linkedUser ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 8 }}>
                    האם הבן אדם רשום ב-Giftly? חפש לפי כינוי או מייל:
                  </p>
                  <div className="search-bar">
                    <input
                      className="field"
                      placeholder="כינוי או מייל..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    />
                    <button type="button" className="btn-tonal" onClick={handleSearch} disabled={searching} style={{ width: 'auto', padding: '0 16px', flexShrink: 0 }}>
                      {searching ? '...' : <span className="material-symbols-outlined">search</span>}
                    </button>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="search-results-list">
                      {searchResults.map(u => (
                        <div key={u.user_id} className="search-result-item" onClick={() => selectLinkedUser(u)}>
                          <strong>{u.display_name}</strong>
                          <span>{PRIVACY_BADGE[u.privacy_level] ?? ''} @{u.nickname}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.length === 0 && searchQuery && !searching && (
                    <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 6 }}>לא נמצא — ממלאים פרטים ידנית למטה</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="linked-badge">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{PRIVACY_ICON[linkedUser.privacy_level] ?? 'link'}</span>
                    מקושר ל: <strong>{linkedUser.display_name}</strong> (@{linkedUser.nickname})
                    <button type="button" className="remove-link" onClick={() => { setLinkedUser(null); setForm(EMPTY_FORM); setPendingPrivacy(null); }}>הסר</button>
                  </div>
                  {pendingPrivacy === 'password' && (
                    <div className="privacy-gate">
                      <p>🔑 משתמש זה מוגן — הזן את קוד הגישה שלו:</p>
                      <input type="password" placeholder="קוד גישה" value={privacyPassword} onChange={e => setPrivacyPassword(e.target.value)} required />
                    </div>
                  )}
                  <div className="field">
                    <label>הערות אישיות (אופציונלי)</label>
                    <textarea placeholder="הערות על הקשר..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                  </div>
                </>
              )}

              {!linkedUser && (
                <div className="field">
                  <label>שם *</label>
                  <input placeholder="שם מלא" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
              )}

              <div className="field">
                <label>קשר</label>
                <input placeholder="חבר, הורה, קולגה..." value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} />
              </div>

              {!linkedUser && (
                <>
                  <div className="field">
                    <label>תחומי עניין</label>
                    <TagInput value={form.interests} onChange={tags => setForm(f => ({ ...f, interests: tags }))} placeholder="הקלד ולחץ פסיק" />
                  </div>
                  <div className="field">
                    <label>תיאור חופשי</label>
                    <textarea placeholder="מה אוהב, מה מעניין..." value={form.free_text} onChange={e => setForm(f => ({ ...f, free_text: e.target.value }))} rows={2} />
                  </div>
                  <div className="field">
                    <label>מגדר</label>
                    <GenderSelect value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))} />
                  </div>
                  <LocationBirthFields
                    birth_date={form.birth_date}
                    city={form.city}
                    country={form.country}
                    onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
                  />
                </>
              )}

              <div className="form-row-btns">
                <button type="submit" className="btn-filled">שמור</button>
                <button type="button" className="btn-surface" onClick={() => setShowForm(false)}>ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <>
          <div className="panel-overlay" onClick={() => setShowHistory(false)} />
          <aside className="panel">
            <div className="panel-header">
              <h2>
                <span className="material-symbols-outlined" style={{ color: 'var(--primary)', marginLeft: 8 }}>history</span>
                היסטוריית המלצות
              </h2>
              <button className="panel-close" onClick={() => setShowHistory(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="panel-body">
              {historyLoading ? (
                <div className="ai-loader">
                  <div className="ai-loader-dots"><span /><span /><span /></div>
                  <p className="ai-loader-text">טוען...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="empty-state">
                  <span className="material-symbols-outlined">lightbulb</span>
                  אין המלצות עדיין
                </div>
              ) : (
                history.map(r => (
                  <div key={r.id} className="history-list-item">
                    <div className="history-item-top">
                      <span className="history-contact-name">{r.contact?.name ?? '—'}</span>
                      <span className="history-price">~{r.estimated_price} ₪</span>
                    </div>
                    <p className="history-title">{r.title}</p>
                    <p className="history-date">{new Date(r.created_at).toLocaleDateString('he-IL')}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

    </div>
  );
}
