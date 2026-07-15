import { useEffect, useState, type FormEvent } from 'react';
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

const PRIVACY_BADGE: Record<string, string> = {
  public:   '🔓',
  approval: '✋',
  password: '🔑',
};

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // חיפוש משתמשים רשומים
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [linkedUser, setLinkedUser] = useState<UserProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [privacyPassword, setPrivacyPassword] = useState('');
  const [pendingPrivacy, setPendingPrivacy] = useState<'password' | null>(null);

  // בקשות ממתינות
  const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);

  // סרגל היסטוריה
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Recommendation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // עריכת פרופיל
  const [showProfile, setShowProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

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

  async function openProfile() {
    setShowProfile(true);
    setProfileError('');
    const p = await api.userProfile.me();
    setProfileForm({
      display_name: p.display_name ?? '',
      nickname: p.nickname ?? '',
      bio: p.bio ?? '',
      gender: p.gender ?? '',
      birth_date: p.birth_date ?? '',
      city: p.city ?? '',
      country: p.country ?? '',
      interests: p.interests ?? [],
      privacy_level: p.privacy_level ?? 'approval',
    });
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      await api.userProfile.update({
        display_name: profileForm.display_name,
        nickname: profileForm.nickname.trim().toLowerCase(),
        bio: profileForm.bio || null,
        gender: profileForm.gender || null,
        birth_date: profileForm.birth_date || null,
        city: profileForm.city || null,
        country: profileForm.country || null,
        interests: profileForm.interests,
        privacy_level: profileForm.privacy_level,
      });
      setShowProfile(false);
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setProfileSaving(false);
    }
  }

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
        // סטטוס 202 — בקשה נשלחה
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

  return (
    <div className="page">
      <header>
        <h1>🎁 Giftly</h1>
        <div className="header-right">
          <span>{user?.email}</span>
          <button className="history-btn" onClick={openProfile}>👤 הפרופיל שלי</button>
          <button className="history-btn" onClick={openHistory}>📋 היסטוריה</button>
          <button onClick={signOut}>יציאה</button>
        </div>
      </header>

      <main>
        {/* בקשות נכנסות */}
        {incomingRequests.length > 0 && (
          <section className="requests-section">
            <h2 className="requests-title">🔔 בקשות ממתינות לאישורך ({incomingRequests.length})</h2>
            {incomingRequests.map(r => (
              <div key={r.id} className="request-card">
                <span>
                  <strong>{(r as any).requester?.display_name ?? r.requester_name ?? 'משתמש'}</strong>
                  {(r as any).requester?.nickname && <span className="req-nick"> @{(r as any).requester.nickname}</span>}
                  {' '}רוצה להוסיף אותך כאיש קשר
                </span>
                <div className="request-actions">
                  <button className="approve-btn" onClick={() => approveRequest(r)}>אשר</button>
                  <button className="reject-btn" onClick={() => rejectRequest(r)}>דחה</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* בקשות יוצאות */}
        {outgoingRequests.filter(r => r.status === 'pending').length > 0 && (
          <section className="requests-section">
            <h2 className="requests-title">⏳ בקשות שלחת וממתינות לאישור</h2>
            {outgoingRequests.filter(r => r.status === 'pending').map(r => (
              <div key={r.id} className="request-card pending-out">
                <span>
                  ממתין לאישור מ-<strong>{r.target_profile?.display_name ?? 'משתמש'}</strong>
                  {r.target_profile?.nickname && <span className="req-nick"> @{r.target_profile.nickname}</span>}
                </span>
              </div>
            ))}
          </section>
        )}

        <div className="section-header">
          <h2>אנשי הקשר שלי</h2>
          <button onClick={openForm}>+ איש קשר חדש</button>
        </div>

        {showForm && (
          <form className="card form-card" onSubmit={createContact}>
            <h3>איש קשר חדש</h3>

            {/* חיפוש משתמש רשום */}
            {!linkedUser ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: 6 }}>
                  האם הבן אדם רשום ב-Giftly? חפש לפי כינוי או מייל:
                </p>
                <div className="row">
                  <input
                    placeholder="כינוי או מייל..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                  />
                  <button type="button" onClick={handleSearch} disabled={searching}>
                    {searching ? '...' : 'חיפוש'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map(u => (
                      <div key={u.user_id} className="search-result-item" onClick={() => selectLinkedUser(u)}>
                        <strong>{u.display_name}</strong>
                        <span>{PRIVACY_BADGE[u.privacy_level] ?? ''} @{u.nickname}</span>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.length === 0 && searchQuery && !searching && (
                  <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: 4 }}>
                    לא נמצא — ממלאים פרטים ידנית למטה
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="linked-user-badge">
                  <span>
                    {PRIVACY_BADGE[linkedUser.privacy_level]} מקושר ל: <strong>{linkedUser.display_name}</strong> (@{linkedUser.nickname})
                  </span>
                  <button type="button" className="link-btn" onClick={() => { setLinkedUser(null); setForm(EMPTY_FORM); setPendingPrivacy(null); }}>
                    הסר
                  </button>
                </div>
                {pendingPrivacy === 'password' && (
                  <div className="privacy-gate">
                    <p>🔑 משתמש זה מוגן — הזן את קוד הגישה שלו:</p>
                    <input
                      type="password"
                      placeholder="קוד גישה"
                      value={privacyPassword}
                      onChange={e => setPrivacyPassword(e.target.value)}
                      required
                    />
                  </div>
                )}
                <textarea
                  placeholder="הערות אישיות שלך על איש הקשר הזה (אופציונלי)..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </>
            )}

            {!linkedUser && (
              <input placeholder="שם" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            )}
            <input placeholder="קשר (בן/בת זוג, הורה, חבר...)" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} />

            {!linkedUser && (
              <>
                <TagInput
                  value={form.interests}
                  onChange={tags => setForm(f => ({ ...f, interests: tags }))}
                  placeholder="תחומי עניין (הקלד ולחץ פסיק)"
                />
                <textarea placeholder="תיאור חופשי" value={form.free_text} onChange={e => setForm(f => ({ ...f, free_text: e.target.value }))} rows={2} />
                <GenderSelect value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))} />
                <LocationBirthFields
                  birth_date={form.birth_date}
                  city={form.city}
                  country={form.country}
                  onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
                />
              </>
            )}

            <div className="row">
              <button type="submit">שמור</button>
              <button type="button" onClick={() => setShowForm(false)}>ביטול</button>
            </div>
          </form>
        )}

        {loading ? <p>טוען...</p> : (
          <div className="profiles-grid">
            {contacts.map(c => (
              <div key={c.id} className="card profile-card" onClick={() => navigate(`/contact/${c.id}`)}>
                <h3>{(c.user_profile as any)?.display_name ?? c.name}</h3>
                {c.relationship && <p className="relationship">{c.relationship}</p>}
                {c.user_profile && <p className="linked-badge">{PRIVACY_BADGE[(c.user_profile as any).privacy_level]} @{(c.user_profile as any).nickname}</p>}
                {(() => {
                  const g = (c.user_profile as any)?.gender ?? c.gender;
                  return g ? <p className="relationship">{g === 'male' ? '👨 זכר' : g === 'female' ? '👩 נקבה' : '🧑 אחר'}</p> : null;
                })()}
                {(c.interests?.length > 0) && (
                  <div className="tags">
                    {c.interests.slice(0, 3).map(i => <span key={i} className="tag">{i}</span>)}
                  </div>
                )}
              </div>
            ))}
            {contacts.length === 0 && !showForm && (
              <p className="empty">אין עדיין אנשי קשר. התחל בלחיצה על "+ איש קשר חדש"</p>
            )}
          </div>
        )}
      </main>

      {/* סרגל היסטוריה */}
      {showHistory && (
        <div className="history-overlay" onClick={() => setShowHistory(false)}>
          <aside className="history-panel" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>📋 היסטוריית המלצות</h2>
              <button className="close-btn" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            {historyLoading ? (
              <div className="ai-loader" style={{ marginTop: 32 }}>
                <div className="ai-loader-dots"><span /><span /><span /></div>
                <p className="ai-loader-text">טוען היסטוריה...</p>
              </div>
            ) : history.length === 0 ? (
              <p className="empty" style={{ padding: '32px 16px' }}>אין המלצות עדיין</p>
            ) : (
              <div className="history-list">
                {history.map(r => (
                  <div key={r.id} className="history-item">
                    <div className="history-item-header">
                      <span className="history-contact">{r.contact?.name ?? '—'}</span>
                      <span className="history-price">~{r.estimated_price} ₪</span>
                    </div>
                    <p className="history-title">{r.title}</p>
                    <p className="history-date">{new Date(r.created_at).toLocaleDateString('he-IL')}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* פאנל עריכת פרופיל */}
      {showProfile && (
        <div className="history-overlay" onClick={() => setShowProfile(false)}>
          <aside className="history-panel" onClick={e => e.stopPropagation()}>
            <div className="history-header">
              <h2>👤 הפרופיל שלי</h2>
              <button className="close-btn" onClick={() => setShowProfile(false)}>✕</button>
            </div>
            {Object.keys(profileForm).length === 0 ? (
              <p className="history-empty">טוען...</p>
            ) : (
              <form onSubmit={saveProfile} className="profile-edit-form">
                <label>שם מלא
                  <input value={profileForm.display_name} onChange={e => setProfileForm((f: any) => ({ ...f, display_name: e.target.value }))} required />
                </label>
                <label>כינוי (מזהה ייחודי)
                  <input value={profileForm.nickname} onChange={e => setProfileForm((f: any) => ({ ...f, nickname: e.target.value }))} required />
                </label>
                <label>מגדר
                  <GenderSelect value={profileForm.gender} onChange={v => setProfileForm((f: any) => ({ ...f, gender: v }))} />
                </label>
                <label>תאריך לידה
                  <input type="date" value={profileForm.birth_date} onChange={e => setProfileForm((f: any) => ({ ...f, birth_date: e.target.value }))} />
                </label>
                <label>עיר
                  <input value={profileForm.city} onChange={e => setProfileForm((f: any) => ({ ...f, city: e.target.value }))} />
                </label>
                <label>מדינה
                  <input value={profileForm.country} onChange={e => setProfileForm((f: any) => ({ ...f, country: e.target.value }))} />
                </label>
                <label>תחביבים ותחומי עניין
                  <TagInput value={profileForm.interests} onChange={v => setProfileForm((f: any) => ({ ...f, interests: v }))} placeholder="ספורט, מוזיקה..." />
                </label>
                <label>ביו
                  <textarea value={profileForm.bio} onChange={e => setProfileForm((f: any) => ({ ...f, bio: e.target.value }))} rows={3} />
                </label>
                <div className="privacy-section">
                  <p><strong>רמת פרטיות</strong></p>
                  {(['public', 'approval', 'password'] as const).map(level => (
                    <label key={level} className="privacy-option">
                      <input type="radio" name="privacy_level" value={level}
                        checked={profileForm.privacy_level === level}
                        onChange={() => setProfileForm((f: any) => ({ ...f, privacy_level: level }))} />
                      {level === 'public' ? '🔓 פתוח — כל אחד יכול לשמור אותך' :
                       level === 'approval' ? '✋ אישור — כל בקשה מחייבת אישורך (ברירת מחדל)' :
                       '🔑 סיסמה — רק מי שיודע את הסיסמה'}
                    </label>
                  ))}
                </div>
                {profileError && <p className="error-msg">{profileError}</p>}
                <button type="submit" disabled={profileSaving}>
                  {profileSaving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
