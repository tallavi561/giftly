import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, ContactRequest, Recommendation, UserProfile } from '../types/index.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import InterestPicker from '../components/InterestPicker.js';
import GenderSelect from '../components/GenderSelect.js';
import { useShellConfig } from '../components/AppShellLayout.js';
import ContactProfileFields from '../components/ContactProfileFields.js';

const logger = new Logger('ContactsListPage');

// Colored-initial avatar palette for the contacts list (UX-UI/GEMINI/אנשי קשר 2.html)
const AVATAR_PALETTE = [
  { bg: 'var(--primary-fixed)', color: 'var(--primary)' },
  { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
  { bg: '#e0f2fe', color: '#0284c7' },
];

const EMPTY_FORM = { name: '', relationship: '', interests: [] as string[], free_text: '', notes: '', gender: '', birth_date: '', city: '', country: '', relationship_status: '', has_children: '' as '' | 'true' | 'false', religion: '' };

const PRIVACY_BADGE: Record<string, string> = { public: '🔓', approval: '✋', password: '🔑' };
const PRIVACY_ICON: Record<string, string> = { public: 'public', approval: 'pan_tool', password: 'lock' };

// Pure browse/search/add list — no responsibility for "what's urgent now",
// that lives on the Home page instead (spec §9(2) in the old FRONTEND_SPEC.md).
export default function ContactsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameFilter, setNameFilter] = useState('');

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
      logger.info('Contacts list loaded');
      setContacts(c);
      setIncomingRequests(inc);
      setOutgoingRequests(out);
      setLoading(false);
    }).catch(err => {
      logger.error('Contacts list load failed', err);
      setLoading(false);
    });
  }, []);

  const visibleContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      const nameA = (a.user_profile as any)?.display_name ?? a.name;
      const nameB = (b.user_profile as any)?.display_name ?? b.name;
      return nameA.localeCompare(nameB, 'he');
    });
    if (!nameFilter.trim()) return sorted;
    const q = nameFilter.trim().toLowerCase();
    return sorted.filter(c => ((c.user_profile as any)?.display_name ?? c.name).toLowerCase().includes(q));
  }, [contacts, nameFilter]);

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
      relationship_status: form.relationship_status || null,
      has_children: form.has_children === 'true' ? true : form.has_children === 'false' ? false : null,
      religion: form.religion || null,
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

  const headerExtra = (
    <>
      <button className="icon-btn" onClick={openHistory} title="היסטוריה">
        <span className="material-symbols-outlined">history</span>
      </button>
    </>
  );
  useShellConfig({ headerExtra });

  return (
    <>
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

      {/* Header */}
      <div className="page-heading" style={{ marginBottom: 0 }}>
        <h1 style={{ fontSize: 26 }}>אנשי הקשר שלי</h1>
        <p>עיון, חיפוש והוספה של אנשי קשר</p>
      </div>

      {contacts.length > 0 && (
        <div className="contact-search-wrap">
          <input
            className="contact-search-input"
            placeholder="חפש איש קשר לפי שם..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
          />
          <span className="material-symbols-outlined contact-search-icon">search</span>
        </div>
      )}

      {/* Floating add-contact button */}
      <button className="btn-fab" onClick={openForm} title="הוסף איש קשר">
        <span className="material-symbols-outlined">add</span>
      </button>

      {/* Contacts grid */}
      {loading ? (
        <p style={{ color: 'var(--on-surface-variant)', marginTop: 32 }}>טוען...</p>
      ) : contacts.length === 0 && !showForm ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">people</span>
          אין עדיין אנשי קשר. לחץ על "הוסף איש קשר" כדי להתחיל.
        </div>
      ) : visibleContacts.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">search_off</span>
          לא נמצאו אנשי קשר בשם "{nameFilter}"
        </div>
      ) : (
        <div className="contacts-list">
          {visibleContacts.map((c, i) => {
            const name = (c.user_profile as any)?.display_name ?? c.name;
            const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
            return (
              <div key={c.id} className="contact-list-item" onClick={() => navigate(`/contact/${c.id}`)}>
                <div className="contact-list-main">
                  <div className="contact-list-avatar" style={{ background: palette.bg, color: palette.color }}>
                    {name.trim().charAt(0)}
                  </div>
                  <h3 className="contact-list-name">{name}</h3>
                </div>
                {c.relationship && <span className="contact-list-badge">{c.relationship}</span>}
              </div>
            );
          })}
        </div>
      )}
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
                    <InterestPicker value={form.interests} onChange={tags => setForm(f => ({ ...f, interests: tags }))} />
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
                  <ContactProfileFields
                    relationship_status={form.relationship_status}
                    has_children={form.has_children}
                    religion={form.religion}
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
    </>
  );
}
