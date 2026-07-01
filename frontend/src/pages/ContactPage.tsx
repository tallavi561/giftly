import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, Event, Recommendation, UserProfile } from '../types/index.js';
import EventForm, { type EventFormValues } from '../components/EventForm.js';

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
  const [contactForm, setContactForm] = useState({
    name: '', relationship: '', interests: '', free_text: '', budget_min: '', budget_max: '',
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
        interests: (c.interests ?? []).join(', '),
        free_text: c.free_text ?? '',
        budget_min: c.budget_min?.toString() ?? '',
        budget_max: c.budget_max?.toString() ?? '',
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
      interests: contactForm.interests.split(',').map(s => s.trim()).filter(Boolean),
      free_text: contactForm.free_text || null,
      budget_min: contactForm.budget_min ? Number(contactForm.budget_min) : null,
      budget_max: contactForm.budget_max ? Number(contactForm.budget_max) : null,
    });
    logger.info('Contact updated', { id: updated.id });
    setContact(updated);
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
  const eventRecs = selectedEvent ? recommendations.filter(r => r.event_id === selectedEvent) : [];

  return (
    <div className="page">
      <header>
        <button className="back-btn" onClick={() => navigate('/')}>← חזרה</button>
        <h1>{contact.name}</h1>
        {contact.relationship && <span className="relationship">{contact.relationship}</span>}
      </header>

      <main>
        <section className="card">
          {editingContact ? (
            <form className="form-card" onSubmit={saveContact}>
              <h3>עריכת איש קשר</h3>
              <input placeholder="שם" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required />
              <input placeholder="קשר" value={contactForm.relationship} onChange={e => setContactForm(f => ({ ...f, relationship: e.target.value }))} />
              {!linkedProfile && (
                <>
                  <input placeholder="תחומי עניין (מופרדים בפסיק)" value={contactForm.interests} onChange={e => setContactForm(f => ({ ...f, interests: e.target.value }))} />
                  <textarea placeholder="תיאור חופשי" value={contactForm.free_text} onChange={e => setContactForm(f => ({ ...f, free_text: e.target.value }))} rows={3} />
                </>
              )}
              <div className="row">
                <input type="number" placeholder="תקציב מינימום ₪" value={contactForm.budget_min} onChange={e => setContactForm(f => ({ ...f, budget_min: e.target.value }))} />
                <input type="number" placeholder="תקציב מקסימום ₪" value={contactForm.budget_max} onChange={e => setContactForm(f => ({ ...f, budget_max: e.target.value }))} />
              </div>
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
              {displayBio && <p style={{ marginTop: 8, color: '#555' }}>{displayBio}</p>}
              {contact.budget_max && (
                <p className="budget">תקציב: {contact.budget_min ?? 0}–{contact.budget_max} ₪</p>
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
            <EventForm onSubmit={addEvent} onCancel={() => setShowEventForm(false)} />
          )}

          <div className="events-list">
            {events.map(ev => (
              <div key={ev.id}>
                {editingEventId === ev.id ? (
                  <EventForm
                    initial={{ type: ev.type, date: ev.date, reminder_days: ev.reminder_days }}
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
                {generating ? 'מחשב...' : '✨ ייצר המלצות'}
              </button>
            </div>
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
          </section>
        )}
      </main>
    </div>
  );
}
