import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, Event, UserProfile } from '../types/index.js';
import EventForm, { type EventFormValues } from '../components/EventForm.js';
import LocationBirthFields from '../components/LocationBirthFields.js';
import InterestPicker, { INTEREST_LABELS } from '../components/InterestPicker.js';
import GenderSelect from '../components/GenderSelect.js';
import { calcAge, formatLocation, nextEventOccurrence, daysUntil } from '../lib/utils.js';
import ContactProfileFields from '../components/ContactProfileFields.js';
import Avatar from '../components/Avatar.js';
import AvatarPicker from '../components/AvatarPicker.js';
import { useAuth } from '../context/AuthContext.js';

const logger = new Logger('ContactPage');

const RELATIONSHIP_STATUS_HE: Record<string, string> = {
  single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', cohabiting: 'ידועים בציבור',
};
const RELIGION_HE: Record<string, string> = {
  jewish: 'יהודי/ה', muslim: 'מוסלמי/ת', christian: 'נוצרי/ת', druze: 'דרוזי/ת', secular: 'חילוני/ת', other: 'אחר',
};

const EVENT_ICONS: Record<string, string> = {
  'יום הולדת': 'cake',
  'יום נישואין': 'favorite',
  'חג': 'celebration',
  'סיום לימודים': 'school',
};

function eventIcon(type: string) {
  return EVENT_ICONS[type] ?? 'event';
}

function urgentBadgeText(days: number): string {
  if (days === 0) return 'היום!';
  if (days === 1) return 'מחר!';
  return `בעוד ${days} ימים!`;
}

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contact, setContact] = useState<Contact | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [showEventForm, setShowEventForm] = useState(searchParams.get('newContact') === 'true');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<{
    name: string; relationship: string; interests: string[]; free_text: string;
    notes: string; gender: string; birth_date: string; city: string; country: string;
    relationship_status: string; has_children: '' | 'true' | 'false'; religion: string;
  }>({
    name: '', relationship: '', interests: [], free_text: '', notes: '',
    gender: '', birth_date: '', city: '', country: '',
    relationship_status: '', has_children: '', religion: '',
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.contacts.get(id),
      api.events.list(id),
    ]).then(([c, e]: any[]) => {
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
        relationship_status: c.relationship_status ?? '',
        has_children: c.has_children === true ? 'true' : c.has_children === false ? 'false' : '',
        religion: c.religion ?? '',
      });
      setEvents(e);
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
      relationship_status: contactForm.relationship_status || null,
      has_children: contactForm.has_children === 'true' ? true : contactForm.has_children === 'false' ? false : null,
      religion: contactForm.religion || null,
    });
    logger.info('Contact updated', { id: updated.id });
    setContact(prev => ({ ...updated, user_profile: prev?.user_profile }));
    setEditingContact(false);
  }

  async function saveAvatar(mode: 'illustrated' | 'silhouette' | 'photo', url: string | null) {
    if (!id) return;
    const updated: any = await api.contacts.update(id, { avatar_mode: mode, avatar_url: url });
    setContact(prev => (prev ? { ...prev, avatar_mode: updated.avatar_mode, avatar_url: updated.avatar_url } : prev));
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
  const avatarMode = linkedProfile?.avatar_mode ?? contact.avatar_mode;
  const avatarUrl = linkedProfile?.avatar_url ?? contact.avatar_url;
  const selectedEventObj = events.find(e => e.id === selectedEvent);
  const budgetMin = selectedEventObj?.budget_min ?? null;
  const budgetMax = selectedEventObj?.budget_max ?? null;
  const hasBudgetFilter = selectedEvent !== null && (budgetMin !== null || budgetMax !== null);

  return (
    <>
          {/* Page header */}
          <div className="contact-page-header">
            <button className="icon-btn" onClick={() => navigate(-1)} title="חזרה">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => setEditingContact(s => !s)}
              title="עריכת פרטים"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>

          {/* Bento grid */}
          <div className="contact-bento">
            {/* Left: profile card */}
            <section className="card" style={{ alignSelf: 'start' }}>
              <div className="profile-card-head">
                <div className="profile-avatar-wrap">
                  <Avatar name={displayName} gender={gender} birthDate={displayBirthDate} avatarMode={avatarMode} avatarUrl={avatarUrl} size={88} className="profile-avatar-lg" />
                  {contact.relationship && <span className="profile-rel-chip">{contact.relationship}</span>}
                  {!linkedProfile && (
                    <button
                      type="button"
                      className="profile-avatar-edit-btn"
                      onClick={() => setEditingAvatar(s => !s)}
                      title="שינוי תמונה"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
                    </button>
                  )}
                </div>
                {editingAvatar && !linkedProfile && (
                  <div style={{ marginTop: 12 }}>
                    <AvatarPicker
                      mode={avatarMode}
                      url={avatarUrl}
                      name={displayName}
                      gender={gender}
                      birthDate={displayBirthDate}
                      uploadPathPrefix={`${user?.id}/contact-${id}`}
                      onChange={saveAvatar}
                    />
                  </div>
                )}
                <h1 className="profile-display-name">{displayName}</h1>
              </div>

              {!editingContact ? (
                <>
                  {linkedProfile && (
                    <div className="profile-linked-badge">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
                      פרופיל מקושר: @{(linkedProfile as any).nickname}
                    </div>
                  )}
                  <div className="meta-pills">
                    {gender && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">wc</span>
                        {gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : 'אחר'}
                      </span>
                    )}
                    {age !== null && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">cake</span>
                        גיל {age}
                      </span>
                    )}
                    {location && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">location_on</span>
                        {location}
                      </span>
                    )}
                    {contact.relationship_status && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">favorite</span>
                        {RELATIONSHIP_STATUS_HE[contact.relationship_status] ?? contact.relationship_status}
                      </span>
                    )}
                    {contact.has_children !== null && contact.has_children !== undefined && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">family_restroom</span>
                        {contact.has_children ? 'עם ילדים' : 'בלי ילדים'}
                      </span>
                    )}
                    {contact.religion && (
                      <span className="meta-pill">
                        <span className="material-symbols-outlined">auto_stories</span>
                        {RELIGION_HE[contact.religion] ?? contact.religion}
                      </span>
                    )}
                  </div>

                  {displayBio && <p className="bio-text">{displayBio}</p>}

                  {displayInterests?.length > 0 && (
                    <div className="tags">
                      {displayInterests.map(i => <span key={i} className="tag">{INTEREST_LABELS[i] ?? i}</span>)}
                    </div>
                  )}

                  {contact.notes && (
                    <div className="notes-box">
                      <span className="material-symbols-outlined">sticky_note_2</span>
                      <span><strong>הערה: </strong>{contact.notes}</span>
                    </div>
                  )}
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
                      <div className="field"><label>תחומי עניין</label><InterestPicker value={contactForm.interests} onChange={tags => setContactForm(f => ({ ...f, interests: tags }))} /></div>
                      <div className="field"><label>תיאור חופשי</label><textarea value={contactForm.free_text} onChange={e => setContactForm(f => ({ ...f, free_text: e.target.value }))} rows={2} /></div>
                      <div className="field"><label>מגדר</label><GenderSelect value={contactForm.gender} onChange={v => setContactForm(f => ({ ...f, gender: v }))} /></div>
                      <LocationBirthFields birth_date={contactForm.birth_date} city={contactForm.city} country={contactForm.country} onChange={(field, value) => setContactForm(f => ({ ...f, [field]: value }))} />
                    </>
                  )}
                  <ContactProfileFields relationship_status={contactForm.relationship_status} has_children={contactForm.has_children} religion={contactForm.religion} onChange={(field, value) => setContactForm(f => ({ ...f, [field]: value }))} />
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

                {editingEventId && (() => {
                  const ev = events.find(e => e.id === editingEventId);
                  if (!ev) return null;
                  return (
                    <div className="event-form-card">
                      <EventForm
                        initial={{ type: ev.type, date: ev.date, reminder_days: ev.reminder_days, budget_min: ev.budget_min, budget_max: ev.budget_max }}
                        birthDate={displayBirthDate}
                        onSubmit={saveEditEvent}
                        onCancel={() => setEditingEventId(null)}
                      />
                    </div>
                  );
                })()}

                {events.length > 0 && (
                  <div className="events-scroll">
                    {events.filter(ev => ev.id !== editingEventId).map(ev => {
                      const occurrence = nextEventOccurrence(ev);
                      const days = occurrence ? daysUntil(occurrence) : null;
                      const soon = days !== null && days <= 6;
                      return (
                        <div
                          key={ev.id}
                          className={`event-card ${soon ? 'urgent' : 'normal'}${selectedEvent === ev.id ? ' selected' : ''}`}
                          onClick={() => setSelectedEvent(ev.id)}
                        >
                          <div className="event-type-badge">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{eventIcon(ev.type)}</span>
                            {soon && days !== null ? urgentBadgeText(days) : ev.type}
                          </div>
                          <div className="event-title">{ev.type}</div>
                          <div className="event-date">{occurrence ? occurrence.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : '—'}</div>
                          {(ev.budget_min || ev.budget_max) && (
                            <div className="event-budget">תקציב: {ev.budget_min ?? 0}–{ev.budget_max ?? '∞'} ₪</div>
                          )}
                          <div className="event-footer">
                            {days !== null ? (
                              <div>
                                <div className="event-days-count">{days}</div>
                                <div className="event-days-unit">ימים נותרו</div>
                              </div>
                            ) : <span />}
                            <button
                              className="event-card-edit"
                              onClick={e => { e.stopPropagation(); setEditingEventId(ev.id); }}
                              title="עריכה"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {events.length === 0 && !showEventForm && (
                  <div className="empty-state" style={{ padding: '24px 0' }}>
                    <span className="material-symbols-outlined">event</span>
                    אין אירועים עדיין
                  </div>
                )}
              </section>

              {/* AI Recommendations — full experience lives on the dedicated find-gift
                  screen now (see FindGiftPage); this is just the entry point. */}
              <section className="ai-banner">
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
                      <p>{events.length > 0 ? 'בחר אירוע כדי לחפש המלצות מתאימות' : 'הוסף אירוע כדי לקבל המלצות מתנה'}</p>
                    )}
                  </div>
                  <button
                    className="btn-filled"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    onClick={() => navigate(`/contact/${id}/find-gift${selectedEvent ? `?event=${selectedEvent}` : ''}`)}
                    disabled={!selectedEvent}
                    title={!selectedEvent ? 'בחר אירוע תחילה' : ''}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                    חפש המלצות
                  </button>
                </div>
              </section>
            </div>
          </div>
    </>
  );
}
