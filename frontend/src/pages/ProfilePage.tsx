import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Profile, Event, Recommendation } from '../types/index.js';
import EventForm, { type EventFormValues } from '../components/EventForm.js';

const logger = new Logger('ProfilePage');


export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showEventForm, setShowEventForm] = useState(searchParams.get('newProfile') === 'true');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', relationship: '', interests: '', free_text: '', budget_min: '', budget_max: '' });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.profiles.get(id),
      api.events.list(id),
      api.recommendations.list(id),
    ]).then(([p, e, r]) => {
      logger.info('Profile page loaded', { profileId: id });
      setProfile(p);
      setProfileForm({
        name: p.name,
        relationship: p.relationship ?? '',
        interests: (p.interests ?? []).join(', '),
        free_text: p.free_text ?? '',
        budget_min: p.budget_min?.toString() ?? '',
        budget_max: p.budget_max?.toString() ?? '',
      });
      setEvents(e);
      setRecommendations(r);
    });
  }, [id]);

  async function addEvent(values: EventFormValues) {
    if (!id) return;
    const created = await api.events.create({ profile_id: id, ...values });
    logger.info('Event created', { id: created.id, type: created.type });
    setEvents(ev => [...ev, created]);
    setShowEventForm(false);
  }

  async function saveEditEvent(values: EventFormValues) {
    if (!editingEventId) return;
    const updated = await api.events.update(editingEventId, values);
    logger.info('Event updated', { id: updated.id });
    setEvents(evs => evs.map(ev => ev.id === editingEventId ? updated : ev));
    setEditingEventId(null);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const updated = await api.profiles.update(id, {
      name: profileForm.name,
      relationship: profileForm.relationship || null,
      interests: profileForm.interests.split(',').map(s => s.trim()).filter(Boolean),
      free_text: profileForm.free_text || null,
      budget_min: profileForm.budget_min ? Number(profileForm.budget_min) : null,
      budget_max: profileForm.budget_max ? Number(profileForm.budget_max) : null,
    });
    logger.info('Profile updated', { id: updated.id });
    setProfile(updated);
    setEditingProfile(false);
  }

  async function generateRecommendations() {
    if (!selectedEvent || !id) return;
    setGenerating(true);
    logger.info('Generating recommendations', { profileId: id, eventId: selectedEvent });
    try {
      const recs = await api.recommendations.generate({ profile_id: id, event_id: selectedEvent });
      setRecommendations(r => [...recs, ...r]);
    } catch (err) {
      logger.error('Generation failed', err);
    } finally {
      setGenerating(false);
    }
  }

  if (!profile) return <div className="loading">טוען...</div>;

  const eventRecs = selectedEvent ? recommendations.filter(r => r.event_id === selectedEvent) : [];

  return (
    <div className="page">
      <header>
        <button className="back-btn" onClick={() => navigate('/')}>← חזרה</button>
        <h1>{profile.name}</h1>
        <span className="relationship">{profile.relationship}</span>
      </header>

      <main>
        <section className="card">
          {editingProfile ? (
            <form className="form-card" onSubmit={saveProfile}>
              <h3>עריכת פרופיל</h3>
              <input placeholder="שם" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} required />
              <input placeholder="קשר (בן/בת זוג, הורה, חבר...)" value={profileForm.relationship} onChange={e => setProfileForm(f => ({ ...f, relationship: e.target.value }))} />
              <input placeholder="תחומי עניין (מופרדים בפסיק)" value={profileForm.interests} onChange={e => setProfileForm(f => ({ ...f, interests: e.target.value }))} />
              <textarea placeholder="תיאור חופשי" value={profileForm.free_text} onChange={e => setProfileForm(f => ({ ...f, free_text: e.target.value }))} rows={3} />
              <div className="row">
                <input type="number" placeholder="תקציב מינימום ₪" value={profileForm.budget_min} onChange={e => setProfileForm(f => ({ ...f, budget_min: e.target.value }))} />
                <input type="number" placeholder="תקציב מקסימום ₪" value={profileForm.budget_max} onChange={e => setProfileForm(f => ({ ...f, budget_max: e.target.value }))} />
              </div>
              <div className="row">
                <button type="submit">שמור</button>
                <button type="button" onClick={() => setEditingProfile(false)}>ביטול</button>
              </div>
            </form>
          ) : (
            <>
              <div className="section-header" style={{ marginTop: 0 }}>
                <h2>פרטים</h2>
                <button className="edit-btn" onClick={() => setEditingProfile(true)}>עריכה</button>
              </div>
              {profile.interests?.length > 0 && (
                <div className="tags">{profile.interests.map(i => <span key={i} className="tag">{i}</span>)}</div>
              )}
              {profile.free_text && <p>{profile.free_text}</p>}
              {profile.budget_max && <p className="budget">תקציב: {profile.budget_min ?? 0}–{profile.budget_max} ₪</p>}
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
                    <button
                      className="edit-btn"
                      onClick={e => { e.stopPropagation(); startEditEvent(ev); }}
                    >
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
              {eventRecs.length === 0 && <p className="empty">לחץ על "ייצר המלצות" לקבלת הצעות מ-AI</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
