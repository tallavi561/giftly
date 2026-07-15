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
    // שומרים user_profile מהסטייט הקודם כי ה-PATCH לא מחזיר join
    setContact(prev => ({ ...updated, user_profile: prev?.user_profile }));
    setEditingContact(false);
  }

  async function generateRecommendations() {
    if (!selectedEvent || !id) return;
    setGenerating(true);
    logger.info('Generating recommendations', { contactId: id, eventId: selectedEvent });
    try {
      const recs: any[] = await api.recommendations.generate({ contact_id: id, event_id: selectedEvent });
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
  const displayInterests = linkedProfile?.interests?.length ? linkedProfile.interests : contact.interests;
  const displayBio = linkedProfile?.bio ?? contact.free_text;
  const displayBirthDate = linkedProfile?.birth_date ?? contact.birth_date;
  const displayCity = linkedProfile?.city ?? contact.city;
  const displayCountry = linkedProfile?.country ?? contact.country;
  const age = calcAge(displayBirthDate);
  const location = formatLocation(displayCity, displayCountry);
  const eventRecs = selectedEvent ? recommendations.filter(r => r.event_id === selectedEvent) : [];

  return (
    <div className="page">
      <header>
        <button className="back-btn" onClick={() => navigate('/')}>← חזרה</button>
        <h1>{linkedProfile?.display_name ?? contact.name}</h1>
        {contact.relationship && <span className="relationship">{contact.relationship}</span>}
      </header>

      <main>
        <section className="card">
          {editingContact ? (
            <form className="form-card" onSubmit={saveContact}>
              <h3>עריכת איש קשר</h3>
              {!linkedProfile && (
                <input placeholder="שם" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required />
              )}
              <input placeholder="קשר (חבר, בן דוד, קולגה...)" value={contactForm.relationship} onChange={e => setContactForm(f => ({ ...f, relationship: e.target.value }))} />
              {!linkedProfile && (
                <>
                  <TagInput
                    value={contactForm.interests}
                    onChange={tags => setContactForm(f => ({ ...f, interests: tags }))}
                    placeholder="תחומי עניין (הקלד ולחץ פסיק)"
                  />
                  <textarea placeholder="תיאור חופשי" value={contactForm.free_text} onChange={e => setContactForm(f => ({ ...f, free_text: e.target.value }))} rows={2} />
                  <GenderSelect value={contactForm.gender} onChange={v => setContactForm(f => ({ ...f, gender: v }))} />
                  <LocationBirthFields
                    birth_date={contactForm.birth_date}
                    city={contactForm.city}
                    country={contactForm.country}
                    onChange={(field, value) => setContactForm(f => ({ ...f, [field]: value }))}
                  />
                </>
              )}
              <textarea
                placeholder={linkedProfile ? 'הערות אישיות שלך על הקשר הזה...' : 'הערות אישיות...'}
                value={contactForm.notes}
                onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
              <div className="row">
                <button type="submit">שמור</button>
                <button type="button" onClick={() => setEditingContact(false)}>ביטול</button>
              </div>
            </form>
          ) : (
            <>
              <div className="section-header" style={{ marginTop: 0 }}>
                <h2>פרטים</h2>
                <button className="edit-btn" onClick={() => setEditingContact(true)}>עריכה</button>
              </div>
              {linkedProfile && (
                <p className="linked-badge" style={{ marginBottom: 8 }}>
                  פרופיל מקושר: <strong>{linkedProfile.display_name}</strong> (@{(linkedProfile as any).nickname})
                </p>
              )}
              {displayInterests?.length > 0 && (
                <div className="tags">{displayInterests.map(i => <span key={i} className="tag">{i}</span>)}</div>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.9rem', color: '#555' }}>
                {(() => {
                  const g = linkedProfile?.gender ?? contact.gender;
                  return g ? <span>{g === 'male' ? '👨 זכר' : g === 'female' ? '👩 נקבה' : '🧑 אחר'}</span> : null;
                })()}
                {age !== null && <span>גיל {age}</span>}
                {location && <span>📍 {location}</span>}
              </div>
              {displayBio && <p style={{ marginTop: 8, color: '#555' }}>{displayBio}</p>}
              {contact.notes && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#fffbeb', borderRadius: 8, fontSize: '0.9rem', color: '#78350f' }}>
                  <strong>הערות: </strong>{contact.notes}
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <div className="section-header">
            <h2>אירועים</h2>
            <button onClick={() => setShowEventForm(s => !s)}>+ אירוע</button>
          </div>

          {showEventForm && (
            <EventForm
              birthDate={displayBirthDate}
              onSubmit={addEvent}
              onCancel={() => setShowEventForm(false)}
            />
          )}

          <div className="events-list">
            {events.map(ev => (
              <div key={ev.id}>
                {editingEventId === ev.id ? (
                  <EventForm
                    initial={{ type: ev.type, date: ev.date, reminder_days: ev.reminder_days, budget_min: ev.budget_min, budget_max: ev.budget_max }}
                    birthDate={displayBirthDate}
                    onSubmit={saveEditEvent}
                    onCancel={() => setEditingEventId(null)}
                  />
                ) : (
                  <div
                    className={`card event-card ${selectedEvent === ev.id ? 'selected' : ''}`}
                    onClick={() => setSelectedEvent(ev.id)}
                  >
                    <span className="event-type">{ev.type}</span>
                    <span className="event-date">{new Date(ev.date).toLocaleDateString('he-IL')}</span>
                    <span className="reminder">תזכורת {ev.reminder_days} יום לפני</span>
                    <button className="edit-btn" onClick={e => { e.stopPropagation(); setEditingEventId(ev.id); }}>
                      עריכה
                    </button>
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && <p className="empty">אין אירועים עדיין</p>}
          </div>
        </section>

        {selectedEvent && (
          <section>
            <div className="section-header">
              <h2>המלצות מתנה</h2>
              <button onClick={generateRecommendations} disabled={generating}>
                {generating ? '⏳ מחשב...' : '✨ ייצר המלצות'}
              </button>
            </div>
            {generating ? (
              <div className="ai-loader">
                <div className="ai-loader-dots">
                  <span /><span /><span />
                </div>
                <p className="ai-loader-text">✨ ה-AI מחפש מתנות מושלמות עבורך...</p>
              </div>
            ) : (
              <div className="recs-list">
                {eventRecs.map(r => (
                  <div key={r.id} className="card rec-card">
                    <div className="rec-header">
                      <h3>{r.title}</h3>
                      <span className="price">~{r.estimated_price} ₪</span>
                    </div>
                    <p>{r.description}</p>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(r.search_query ?? r.title)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      חיפוש בגוגל →
                    </a>
                  </div>
                ))}
                {eventRecs.length === 0 && (
                  <p className="empty">לחץ על "ייצר המלצות" לקבלת הצעות מ-AI</p>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
