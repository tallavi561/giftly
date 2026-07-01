import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, UserProfile } from '../types/index.js';

const logger = new Logger('DashboardPage');

const EMPTY_FORM = { name: '', relationship: '', interests: '', free_text: '', budget_min: '', budget_max: '' };

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

  useEffect(() => {
    api.contacts.list().then((data: any) => {
      logger.info('Contacts loaded', { count: data.length });
      setContacts(data);
      setLoading(false);
    });
  }, []);

  async function handleSearch() {
    if (searchQuery.length < 2) return;
    setSearching(true);
    const results = await api.userProfile.search(searchQuery);
    setSearchResults(results);
    setSearching(false);
  }

  function selectLinkedUser(u: UserProfile) {
    setLinkedUser(u);
    setForm(f => ({ ...f, name: u.display_name, interests: u.interests.join(', ') }));
    setSearchResults([]);
    setSearchQuery('');
  }

  async function createContact(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      relationship: form.relationship || null,
      linked_user_id: linkedUser?.user_id ?? null,
      interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
      free_text: form.free_text || null,
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
    };
    const created: any = await api.contacts.create(payload);
    logger.info('Contact created', { id: created.id });
    setContacts(c => [...c, created]);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setLinkedUser(null);
    navigate(`/contact/${created.id}?newContact=true`);
  }

  function openForm() {
    setShowForm(true);
    setLinkedUser(null);
    setForm(EMPTY_FORM);
    setSearchQuery('');
    setSearchResults([]);
  }

  return (
    <div className="page">
      <header>
        <h1>🎁 Giftly</h1>
        <div className="header-right">
          <span>{user?.email}</span>
          <button onClick={signOut}>יציאה</button>
        </div>
      </header>

      <main>
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
                        <span>@{u.nickname}</span>
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
              <div className="linked-user-badge">
                <span>מקושר ל: <strong>{linkedUser.display_name}</strong> (@{linkedUser.nickname})</span>
                <button type="button" className="link-btn" onClick={() => { setLinkedUser(null); setForm(EMPTY_FORM); }}>
                  הסר
                </button>
              </div>
            )}

            <input placeholder="שם (לשימוש שלך)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <input placeholder="קשר (בן/בת זוג, הורה, חבר...)" value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} />

            {!linkedUser && (
              <>
                <input placeholder="תחומי עניין (מופרדים בפסיק)" value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} />
                <textarea placeholder="תיאור חופשי" value={form.free_text} onChange={e => setForm(f => ({ ...f, free_text: e.target.value }))} rows={2} />
              </>
            )}

            <div className="row">
              <input type="number" placeholder="תקציב מינימום ₪" value={form.budget_min} onChange={e => setForm(f => ({ ...f, budget_min: e.target.value }))} />
              <input type="number" placeholder="תקציב מקסימום ₪" value={form.budget_max} onChange={e => setForm(f => ({ ...f, budget_max: e.target.value }))} />
            </div>
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
                <h3>{c.name}</h3>
                {c.relationship && <p className="relationship">{c.relationship}</p>}
                {c.user_profile && <p className="linked-badge">@{(c.user_profile as any).nickname}</p>}
                {(c.interests?.length > 0) && (
                  <div className="tags">
                    {c.interests.slice(0, 3).map(i => <span key={i} className="tag">{i}</span>)}
                  </div>
                )}
                {c.budget_max && <p className="budget">עד {c.budget_max} ₪</p>}
              </div>
            ))}
            {contacts.length === 0 && !showForm && (
              <p className="empty">אין עדיין אנשי קשר. התחל בלחיצה על "+ איש קשר חדש"</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
