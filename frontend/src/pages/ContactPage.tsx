import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, Event, Recommendation, UserProfile } from '../types/index.js';
import EventForm, { type EventFormValues } from '../components/EventForm.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import TagInput from '../components/TagInput.js';
import GenderSelect from '../components/GenderSelect.js';
import { calcAge, formatLocation } from '../lib/utils.js';

const logger = new Logger('ContactPage');

const EVENT_ICONS: Record<string, string> = {
  'יום הולדת': 'cake',
  'יום נישואין': 'favorite',
  'חג': 'celebration',
  'סיום לימודים': 'school',
};

function eventIcon(type: string) {
  return EVENT_ICONS[type] ?? 'event';
}

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contact, setContact] = useState<Contact | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showEventForm, setShowEventForm] = useState(searchParams.get('newContact') === 'true');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<{
    name: string; relationship: string; interests: string[]; free_text: string;
    notes: string; gender: string; birth_date: string; city: string; country: string;
  }>({
    name: '', relationship: '', interests: [], free_text: '', notes: '',
    gender: '', birth_date: '', city: '', country: '',
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.contacts.get(id),
      api.events.list(id),
      api.recommendations.list(id),
    ]).then(([c, e, r]: any[]) => {
      logger.info('Contact page loaded', { contactId: id });
      setContact(c);
      setContactForm({
        name: c.name,
        relationship: c.relationship ?? '',
        interests: c.interests ?? [],
        free_text: c.free_text ?? '',
        notes: c.notes ?? '',
        gender: c.gender ?? '',
        birth_date: c.birth_date ?? '',
        city: c.city ?? '',
        country: c.country ?? '',
      });
      setEvents(e);
      setRecommendations(r);
    });
  }, [id]);

  async function addEvent(values: EventFormValues) {
    if (!id) return;
    const created: any = await api.events.create({ contact_id: id, ...values });
    logger.info('Event created', { id: created.id });
    setEvents(ev => [...ev, created]);
    setShowEventForm(false);
  }

  async function saveEditEvent(values: EventFormValues) {
    if (!editingEventId) return;
    const updated: any = await api.events.update(editingEventId, values);
    logger.info('Event updated', { id: updated.id });
    setEvents(evs => evs.map(ev => ev.id === editingEventId ? updated : ev));
    setEditingEventId(null);
  }

  async function saveContact(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const updated: any = await api.contacts.update(id, {
      name: contactForm.name,
      relationship: contactForm.relationship || null,
      interests: contactForm.interests,
      free_text: contactForm.free_text || null,
      notes: contactForm.notes || null,
      gender: contactForm.gender || null,
      birth_date: contactForm.birth_date || null,
      city: contactForm.city || null,
      country: contactForm.country || null,
    });
    logger.info('Contact updated', { id: updated.id });
    setContact(prev => ({ ...updated, user_profile: prev?.user_profile }));
    setEditingContact(false);
  }

  async function generateRecommendations() {
    if (!selectedEvent || !id) return;
    setGenerating(true);
    logger.info('Generating recommendations', { contactId: id, eventId: selectedEvent });
    try {
      const result: any = await api.recommendations.generate({ contact_id: id, event_id: selectedEvent });
      const recs: any[] = result.recommendations ?? result;
      setRecommendations(r => [...recs, ...r]);
    } catch (err) {
      logger.error('Generation failed', err);
      alert((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (!contact) return <div className="loading">טוען...</div>;

  const linkedProfile = contact.user_profile as UserProfile | undefined;
  const displayName = linkedProfile?.display_name ?? contact.name;
  const displayInterests = linkedProfile?.interests?.length ? linkedProfile.interests : contact.interests;
  const displayBio = linkedProfile?.bio ?? contact.free_text;
  const displayBirthDate = linkedProfile?.birth_date ?? contact.birth_date;
  const displayCity = linkedProfile?.city ?? contact.city;
  const displayCountry = linkedProfile?.country ?? contact.country;
  const age = calcAge(displayBirthDate);
  const location = formatLocation(displayCity, displayCountry);
  const gender = linkedProfile?.gender ?? contact.gender;
  const selectedEventObj = events.find(e => e.id === selectedEvent);

  // Budget filter: when an event is selected, keep only recs within its price range
  const budgetMin = selectedEventObj?.budget_min ?? null;
  const budgetMax = selectedEventObj?.budget_max ?? null;
  const hasBudgetFilter = selectedEvent !== null && (budgetMin !== null || budgetMax !== null);
  const displayedRecs = hasBudgetFilter
    ? recommendations.filter(r => {
        const price = r.estimated_price ?? 0;
        if (budgetMin !== null && price < budgetMin) return false;
        if (budgetMax !== null && price > budgetMax) return false;
        return true;
      })
    : recommendations;

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <img src="/logo.png" alt="Giftly" />
          </div>
          <div className="top-bar-actions">
            <button className="btn-signout" onClick={() => navigate('/')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 4 }}>arrow_forward</span>
              חזרה
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <main className="main-content">
          {/* Page header */}
          <div className="contact-page-header">
            <button className="back-btn" onClick={() => navigate('/')}>
              <span className="material-symbols-outlined">chevron_right</span>
              אנשי קשר
            </button>
            {contact.relationship && (
              <span className="profile-rel-chip">{contact.relationship}</span>
            )}
          </div>

          {/* Bento grid */}
          <div className="contact-bento">
            {/* Left: profile card */}
            <section className="card" style={{ alignSelf: 'start' }}>
              <div className="profile-card-head">
                <div className="profile-avatar-lg">{displayName?.[0] ?? '?'}</div>
                <h1 className="profile-display-name">{displayName}</h1>
                {contact.relationship && <span className="profile-rel-chip">{contact.relationship}</span>}
              </div>

              {!editingContact ? (
                <>
                  {linkedProfile && (
                    <div className="profile-linked-badge">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                      פרופיל מקושר: @{(linkedProfile as any).nickname}
                    </div>
                  )}
                  <div className="profile-meta">
                    {gender && (
                      <div className="profile-meta-row">
                        <span className="profile-meta-label">מגדר</span>
                        <span className="profile-meta-value">{gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : 'אחר'}</span>
                      </div>
                    )}
                    {age !== null && (
                      <div className="profile-meta-row">
                        <span className="profile-meta-label">גיל</span>
                        <span className="profile-meta-value">{age}</span>
                      </div>
                    )}
                    {location && (
                      <div className="profile-meta-row">
                        <span className="profile-meta-label">מיקום</span>
                        <span className="profile-meta-value">{location}</span>
                      </div>
                    )}
                    {displayInterests?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <p className="profile-meta-label" style={{ marginBottom: 6 }}>תחומי עניין</p>
                        <div className="tags">
                          {displayInterests.map(i => <span key={i} className="tag">{i}</span>)}
                        </div>
                      </div>
                    )}
                    {displayBio && (
                      <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 10, lineHeight: 1.5 }}>{displayBio}</p>
                    )}
                    {contact.notes && (
                      <div className="notes-box">
                        <strong>הערות: </strong>{contact.notes}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-surface"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                    onClick={() => setEditingContact(true)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    עריכת פרטים
                  </button>
                </>
              ) : (
                <form className="fields-stack" onSubmit={saveContact} style={{ marginTop: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>עריכת פרטים</h3>
                  {!linkedProfile && (
                    <div className="field"><label>שם</label><input value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required /></div>
                  )}
                  <div className="field"><label>קשר</label><input placeholder="חבר, בן דוד..." value={contactForm.relationship} onChange={e => setContactForm(f => ({ ...f, relationship: e.target.value }))} /></div>
                  {!linkedProfile && (
                    <>
                      <div className="field"><label>תחומי עניין</label><TagInput value={contactForm.interests} onChange={tags => setContactForm(f => ({ ...f, interests: tags }))} placeholder="הקלד ולחץ פסיק" /></div>
                      <div className="field"><label>תיאור חופשי</label><textarea value={contactForm.free_text} onChange={e => setContactForm(f => ({ ...f, free_text: e.target.value }))} rows={2} /></div>
                      <div className="field"><label>מגדר</label><GenderSelect value={contactForm.gender} onChange={v => setContactForm(f => ({ ...f, gender: v }))} /></div>
                      <LocationBirthFields birth_date={contactForm.birth_date} city={contactForm.city} country={contactForm.country} onChange={(field, value) => setContactForm(f => ({ ...f, [field]: value }))} />
                    </>
                  )}
                  <div className="field"><label>הערות אישיות</label><textarea value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
                  <div className="form-row-btns">
                    <button type="submit" className="btn-filled">שמור</button>
                    <button type="button" className="btn-surface" onClick={() => setEditingContact(false)}>ביטול</button>
                  </div>
                </form>
              )}
            </section>

            {/* Right: events + AI */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Events */}
              <section className="card">
                <div className="section-actions" style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 20, marginLeft: 6 }}>event_upcoming</span>
                    אירועים
                  </h2>
                  <button className="btn-ghost" onClick={() => setShowEventForm(s => !s)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    אירוע חדש
                  </button>
                </div>

                {showEventForm && (
                  <div className="event-form-card">
                    <EventForm birthDate={displayBirthDate} onSubmit={addEvent} onCancel={() => setShowEventForm(false)} />
                  </div>
                )}

                {events.map(ev => (
                  <div key={ev.id}>
                    {editingEventId === ev.id ? (
                      <div className="event-form-card">
                        <EventForm
                          initial={{ type: ev.type, date: ev.date, reminder_days: ev.reminder_days, budget_min: ev.budget_min, budget_max: ev.budget_max }}
                          birthDate={displayBirthDate}
                          onSubmit={saveEditEvent}
                          onCancel={() => setEditingEventId(null)}
                        />
                      </div>
                    ) : (
                      <div
                        className={`event-item${selectedEvent === ev.id ? ' selected' : ''}`}
                        onClick={() => setSelectedEvent(ev.id)}
                      >
                        <div className="event-icon">
                          <span className="material-symbols-outlined">{eventIcon(ev.type)}</span>
                        </div>
                        <div className="event-info">
                          <div className="event-type">{ev.type}</div>
                          <div className="event-date">{new Date(ev.date).toLocaleDateString('he-IL')}</div>
                          {ev.budget_min || ev.budget_max ? (
                            <div className="event-reminder">
                              תקציב: {ev.budget_min ?? 0}–{ev.budget_max ?? '∞'} ₪
                            </div>
                          ) : null}
                        </div>
                        <button
                          className="btn-icon-sm"
                          style={{ background: 'var(--surface-container)', color: 'var(--on-surface-variant)' }}
                          onClick={e => { e.stopPropagation(); setEditingEventId(ev.id); }}
                          title="עריכה"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {events.length === 0 && !showEventForm && (
                  <div className="empty-state" style={{ padding: '24px 0' }}>
                    <span className="material-symbols-outlined">event</span>
                    אין אירועים עדיין
                  </div>
                )}
              </section>

              {/* AI Recommendations */}
              <section className="card" style={{ background: 'rgba(79,70,229,0.03)', borderColor: 'rgba(79,70,229,0.15)' }}>
                <div className="ai-section-header">
                  <div className="ai-badge">
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize: 22 }}>auto_awesome</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2>המלצות מתנה חכמות</h2>
                    {hasBudgetFilter ? (
                      <div className="budget-filter-chip">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>filter_list</span>
                        מסונן לפי תקציב: {budgetMin ?? 0}–{budgetMax ?? '∞'} ₪
                        <button
                          className="budget-filter-clear"
                          onClick={() => setSelectedEvent(null)}
                          title="הסר סינון"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                        {recommendations.length > 0
                          ? 'לחץ על אירוע כדי לסנן לפי תקציב'
                          : 'בחר אירוע וייצר המלצות'}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn-filled"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    onClick={generateRecommendations}
                    disabled={generating || !selectedEvent}
                    title={!selectedEvent ? 'בחר אירוע תחילה' : ''}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lightbulb</span>
                    {generating ? 'מחשב...' : 'ייצר המלצות'}
                  </button>
                </div>

                {generating ? (
                  <div className="ai-loader">
                    <div className="ai-loader-dots"><span /><span /><span /></div>
                    <p className="ai-loader-text">✨ ה-AI מחפש מתנות מושלמות עבורך...</p>
                  </div>
                ) : displayedRecs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <span className="material-symbols-outlined">card_giftcard</span>
                    {hasBudgetFilter
                      ? 'אין המלצות בתקציב זה — נסה לייצר המלצות חדשות'
                      : 'בחר אירוע ולחץ "ייצר המלצות" לקבלת הצעות מ-AI'}
                  </div>
                ) : (
                  <div className="recs-grid">
                    {displayedRecs.map(r => (
                      <div key={r.id} className="rec-card">
                        <div className="rec-card-header">
                          <span className="rec-card-title">{r.title}</span>
                          <span className="rec-card-price">~{r.estimated_price} ₪</span>
                        </div>
                        <div className="rec-card-body">
                          <p className="rec-card-desc">{r.description}</p>
                          <a
                            className="rec-card-link"
                            href={`https://www.google.com/search?q=${encodeURIComponent(r.search_query ?? r.title)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>search</span>
                            חיפוש בגוגל
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
