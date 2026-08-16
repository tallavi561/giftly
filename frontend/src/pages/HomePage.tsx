import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import type { Contact, Event } from '../types/index.js';
import Avatar from '../components/Avatar.js';
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
  if (days <= 6) return `בעוד ${days} ימים!`;
  if (days <= 13) return 'בעוד שבוע';
  if (days <= 45) return `בעוד ${Math.round(days / 7)} שבועות`;
  return 'חודש הבא';
}

interface SelfSuggestionSlim { id: string; rating: number | null; batch_id: string }

// The Home tab — "אירועים ששווה להתכונן אליהם" (spec §9(1) in the old
// FRONTEND_SPEC.md): contacts sorted by soonest event, plus a nudge back to
// My Gifts when there are unrated self-suggestions. Contacts is now a pure
// browse/search/add list at /contacts — this page owns "what's urgent now".
export default function HomePage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [unratedSuggestions, setUnratedSuggestions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.contacts.list(),
      api.events.list(),
      api.selfRecommendations.list().catch(() => [] as SelfSuggestionSlim[]),
    ]).then(([c, ev, suggestions]: any[]) => {
      logger.info('Home loaded');
      setContacts(c);
      setEvents(ev);
      // Only the latest batch matters — older unrated suggestions are stale by design.
      const latestBatchId = suggestions[0]?.batch_id;
      setUnratedSuggestions(
        latestBatchId ? suggestions.filter((s: any) => s.batch_id === latestBatchId && s.rating === null).length : 0,
      );
      setLoading(false);
    }).catch(err => {
      logger.error('Home load failed', err);
      setLoading(false);
    });
  }, []);

  const upcoming = useMemo(() => {
    const map = new Map<string, { contact: Contact; type: string; days: number }>();
    for (const ev of events) {
      const occurrence = nextEventOccurrence(ev);
      if (!occurrence) continue;
      const days = daysUntil(occurrence);
      const existing = map.get(ev.contact_id);
      if (!existing || days < existing.days) {
        const contact = contacts.find(c => c.id === ev.contact_id);
        if (contact) map.set(ev.contact_id, { contact, type: ev.type, days });
      }
    }
    return [...map.values()].sort((a, b) => a.days - b.days);
  }, [contacts, events]);

  return (
    <>
      <div className="page-heading" style={{ marginBottom: 0 }}>
        <h1 style={{ fontSize: 28 }}>בית</h1>
        <p>אירועים קרובים ששווה להתכונן אליהם</p>
      </div>

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

      {loading ? (
        <p style={{ color: 'var(--on-surface-variant)', marginTop: 32 }}>טוען...</p>
      ) : upcoming.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">event_available</span>
          {contacts.length === 0
            ? 'עדיין אין אנשי קשר — הוסף אנשי קשר ואירועים כדי לראות כאן מה קרוב.'
            : 'אין אירועים קרובים כרגע.'}
        </div>
      ) : (
        <div className="contacts-list" style={{ marginTop: 20 }}>
          {upcoming.map(({ contact: c, type, days }) => {
            const name = (c.user_profile as any)?.display_name ?? c.name;
            const gender = c.user_profile?.gender ?? c.gender;
            const avatarMode = c.user_profile?.avatar_mode ?? c.avatar_mode;
            const avatarUrl = c.user_profile?.avatar_url ?? c.avatar_url;
            const birthDate = c.user_profile?.birth_date ?? c.birth_date;
            const tier = days <= 6 ? 'soon' : days <= 45 ? 'gold' : '';
            return (
              <div key={c.id} className="contact-row">
                {tier === 'soon' && (
                  <div className="contact-row-badge">
                    <span className="material-symbols-outlined">card_giftcard</span>
                    {type}
                  </div>
                )}
                <div className="contact-row-card" onClick={() => navigate(`/contact/${c.id}`)}>
                  <div className="contact-row-main">
                    <Avatar name={name} gender={gender} birthDate={birthDate} avatarMode={avatarMode} avatarUrl={avatarUrl} size={56} className="contact-row-avatar" />
                    <h3 className="contact-row-name">{name}</h3>
                  </div>
                  <div className="contact-row-trailing">
                    <div className={`contact-row-days${tier ? ` ${tier}` : ''}`}>
                      <span className="material-symbols-outlined icon-fill">{EVENT_TYPE_ICONS[type] ?? 'event'}</span>
                      <span>{formatCountdown(days)}</span>
                    </div>
                    <button
                      type="button"
                      className="home-find-gift-btn"
                      title={`מצא מתנה עבור ${name}`}
                      onClick={e => { e.stopPropagation(); navigate(`/contact/${c.id}/find-gift`); }}
                    >
                      <span className="material-symbols-outlined">redeem</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
