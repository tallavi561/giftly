import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, Event, MatchedDeal } from '../types/index.js';
import { nextEventOccurrence, daysUntil } from '../lib/utils.js';

const logger = new Logger('HomePage');

const EVENT_TYPE_ICONS: Record<string, string> = {
  'יום הולדת': 'cake',
  'יום נישואין': 'favorite',
  'חג': 'celebration',
  'סיום לימודים': 'school',
};

function formatCountdown(days: number): string {
  if (days === 0) return 'היום!';
  if (days === 1) return 'מחר!';
  return `בעוד ${days} ימים`;
}

// Deals are matched for "buy ahead of a future event" — months read better
// than a raw day count once we're out that far (spec: FRONTEND_SPEC2.md §10).
function formatDealTiming(days: number): string {
  if (days >= 60) return `עוד ${Math.round(days / 30)} חודשים`;
  return formatCountdown(days);
}

interface SelfSuggestionSlim { id: string; rating: number | null; batch_id: string }
interface UpcomingItem { contact: Contact; eventId: string; type: string; days: number; occurrence: Date }

// The Home tab — ported from UX-UI/GEMINI/HOME.html: one "spotlight" hero
// card for the single most urgent contact/event, a row of (currently
// decorative — see .home-cat-chip below) quick-idea filters, and a compact
// "upcoming in calendar" list for everything else. The unrated-suggestions
// banner isn't in that mockup (it only shows one static state) but is kept —
// it's a real feature from the original FRONTEND_SPEC.md §9(1) plan, not
// something the mockup round removed.
export default function HomePage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [unratedSuggestions, setUnratedSuggestions] = useState(0);
  const [deals, setDeals] = useState<MatchedDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.contacts.list(),
      api.events.list(),
      api.selfRecommendations.list().catch(() => [] as SelfSuggestionSlim[]),
      api.deals.forMe().catch(err => { logger.error('Load deals failed', err); return [] as MatchedDeal[]; }),
    ]).then(([c, ev, suggestions, matchedDeals]: any[]) => {
      logger.info('Home loaded');
      setContacts(c);
      setEvents(ev);
      // Only the latest batch matters — older unrated suggestions are stale by design.
      const latestBatchId = suggestions[0]?.batch_id;
      setUnratedSuggestions(
        latestBatchId ? suggestions.filter((s: any) => s.batch_id === latestBatchId && s.rating === null).length : 0,
      );
      setDeals(matchedDeals);
      setLoading(false);
    }).catch(err => {
      logger.error('Home load failed', err);
      setLoading(false);
    });
  }, []);

  const upcoming = useMemo(() => {
    const map = new Map<string, UpcomingItem>();
    for (const ev of events) {
      const occurrence = nextEventOccurrence(ev);
      if (!occurrence) continue;
      const days = daysUntil(occurrence);
      const existing = map.get(ev.contact_id);
      if (!existing || days < existing.days) {
        const contact = contacts.find(c => c.id === ev.contact_id);
        if (contact) map.set(ev.contact_id, { contact, eventId: ev.id, type: ev.type, days, occurrence });
      }
    }
    return [...map.values()].sort((a, b) => a.days - b.days);
  }, [contacts, events]);

  const [spotlight, ...rest] = upcoming;
  const upcomingByContact = useMemo(() => new Map(upcoming.map(u => [u.contact.id, u])), [upcoming]);

  return (
    <>
      <section className="home-hero-text">
        <h1>היי, מוכנים לחגוג? ✨</h1>
        <p>הנה האירועים הקרובים ששווה להתכונן אליהם</p>
      </section>

      {loading ? (
        <p style={{ color: 'var(--on-surface-variant)', marginTop: 32 }}>טוען...</p>
      ) : !spotlight ? (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <span className="material-symbols-outlined">event_available</span>
          {contacts.length === 0
            ? 'עדיין אין אנשי קשר — הוסף אנשי קשר ואירועים כדי לראות כאן מה קרוב.'
            : 'אין אירועים קרובים כרגע.'}
        </div>
      ) : (
        <>
          {(() => {
            const name = (spotlight.contact.user_profile as any)?.display_name ?? spotlight.contact.name;
            const firstName = name.trim().split(' ')[0];
            return (
              <section
                className="home-spotlight-card"
                onClick={() => navigate(`/contact/${spotlight.contact.id}/find-gift?event=${spotlight.eventId}`)}
              >
                <div className="home-spotlight-tag">
                  <span className="material-symbols-outlined icon-fill">{EVENT_TYPE_ICONS[spotlight.type] ?? 'event'}</span>
                  <span>{spotlight.type}</span>
                </div>
                <div className="home-spotlight-info">
                  <div className="home-spotlight-person">
                    <div className="home-spotlight-avatar">{name.trim().charAt(0)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="home-spotlight-name">{firstName}</div>
                      <div className="home-spotlight-date">{spotlight.occurrence.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</div>
                    </div>
                  </div>
                  <div className="home-spotlight-countdown">
                    <div className="days">{spotlight.days}</div>
                    <div className="label">ימים נותרו</div>
                  </div>
                </div>
                <button type="button" className="home-spotlight-btn">
                  <span className="material-symbols-outlined">auto_awesome</span>
                  <span>חפש מתנות מותאמות</span>
                </button>
              </section>
            );
          })()}

          {unratedSuggestions > 0 && (
            <div className="home-suggestions-banner" onClick={() => navigate('/my-gifts')}>
              <span className="material-symbols-outlined icon-fill">auto_awesome</span>
              <div>
                <strong>יש לך {unratedSuggestions} הצעות חדשות ב"הצעות בשבילי"</strong>
                <p>דרג אותן כדי לעזור למנוע ההמלצות להכיר אותך טוב יותר</p>
              </div>
              <span className="material-symbols-outlined">chevron_left</span>
            </div>
          )}

          {deals.length > 0 && (
            <>
              <div className="home-deals-header">
                <h3>
                  <span className="material-symbols-outlined icon-fill">local_fire_department</span>
                  מבצעים שווים לאירועים קדימה
                </h3>
                <p>קונים עכשיו בזול ושומרים לאירועים עתידיים 💡</p>
              </div>
              <div className="home-deals-scroll">
                {deals.map(m => {
                  // Only try to attach a specific "for X's birthday" event
                  // when the deal matched exactly one contact — once it's
                  // matched to several (e.g. two contacts who both like
                  // books), picking one contact's event to headline would be
                  // arbitrary, so just list everyone it's relevant to.
                  const namesText = m.contacts.map(c => c.contact_name).join(', ');
                  const upcomingForContact = m.contacts.length === 1 ? upcomingByContact.get(m.contacts[0].contact_id) : undefined;
                  const forEventText = upcomingForContact
                    ? `${upcomingForContact.type} ל${namesText} (${formatDealTiming(upcomingForContact.days)})`
                    : namesText;
                  return (
                    <a key={m.deal.id} className="home-deal-card" href={m.deal.source_url} target="_blank" rel="noreferrer">
                      {m.deal.discount_pct != null && <span className="home-deal-badge">{m.deal.discount_pct}%-</span>}
                      <div className="home-deal-for-event">
                        <span className="material-symbols-outlined">calendar_month</span>
                        {forEventText}
                      </div>
                      <div className="home-deal-title">{m.deal.title}</div>
                      <div className="home-deal-category">
                        <span className="home-deal-category-badge">{m.category_label}</span>
                        <span className="home-deal-reason">{m.match_reason}</span>
                      </div>
                      <div className="home-deal-pricing">
                        {m.deal.current_price != null && <span className="current-price">₪{m.deal.current_price}</span>}
                        {m.deal.original_price != null && <span className="original-price">₪{m.deal.original_price}</span>}
                      </div>
                      <span className="home-deal-action-btn">
                        לפרטים ורכישה
                        <span className="material-symbols-outlined">arrow_back</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </>
          )}

          <div className="home-section-title">
            <h3>רעיונות מהירים</h3>
          </div>
          <div className="home-categories-row">
            <div className="home-cat-chip" title="בקרוב">
              <span className="material-symbols-outlined">card_giftcard</span>
              מתנות פופולריות
            </div>
            <div className="home-cat-chip" title="בקרוב">
              <span className="material-symbols-outlined">local_cafe</span>
              חוויות ובילויים
            </div>
            <div className="home-cat-chip" title="בקרוב">
              <span className="material-symbols-outlined">sell</span>
              עד ₪150
            </div>
          </div>

          {rest.length > 0 && (
            <>
              <div className="home-section-title">
                <h3>בקרוב ביומן</h3>
                <a onClick={() => navigate('/calendar')}>הצג הכל</a>
              </div>
              <div className="home-upcoming-list">
                {rest.map(item => {
                  const name = (item.contact.user_profile as any)?.display_name ?? item.contact.name;
                  return (
                    <div key={item.contact.id} className="home-event-card-item" onClick={() => navigate(`/contact/${item.contact.id}`)}>
                      <div className="home-event-item-right">
                        <div className="home-event-item-icon">
                          <span className="material-symbols-outlined">{EVENT_TYPE_ICONS[item.type] ?? 'event'}</span>
                        </div>
                        <div className="home-event-item-info">
                          <h4>{item.type} ל{name}</h4>
                          <p>{item.occurrence.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</p>
                        </div>
                      </div>
                      <span className="home-event-item-tag">{formatCountdown(item.days)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
