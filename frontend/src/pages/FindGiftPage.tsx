import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import { useShellConfig } from '../components/AppShellLayout.js';
import { gradientForCategory } from '../lib/utils.js';
import { nextEventOccurrence, daysUntil } from '../lib/utils.js';
import { getLocalFit, setLocalFit, type LocalFit } from '../lib/localGiftRatings.js';
import type { Contact, Event, Recommendation } from '../types/index.js';

const logger = new Logger('FindGiftPage');

// Dedicated full-screen swipe feed for finding a gift for one contact —
// replaces the old "buried horizontal carousel below the profile" flow
// (see Specs/Front/FRONTEND_SPEC2.md §9(4)). Sourced from the same
// POST /api/recommendations the inline carousel on ContactPage uses; the
// fit/not-fit buttons are local-only for now (see lib/localGiftRatings.ts).

function GiftCard({ rec, isActive }: { rec: Recommendation; isActive: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [playKey, setPlayKey] = useState(0);
  const [fit, setFit] = useState<LocalFit | null>(() => getLocalFit(rec.id));

  useEffect(() => { if (isActive) setPlayKey(k => k + 1); }, [isActive]);

  function handleFit(value: LocalFit) {
    setLocalFit(rec.id, value);
    setFit(value);
  }

  return (
    <section className="mg-feed-item" ref={cardRef}>
      {rec.image_url ? (
        <img className="mg-feed-img" src={rec.image_url} alt={rec.title} />
      ) : (
        <div className="mg-feed-img mg-feed-placeholder" style={{ background: gradientForCategory(rec.category) }}>
          <span className="material-symbols-outlined">card_giftcard</span>
        </div>
      )}
      <div className="mg-feed-scrim" />
      <div className="mg-feed-content">
        {rec.score != null && (
          <span className="mg-feed-badge">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>star</span>
            {Math.round(rec.score <= 1 ? rec.score * 100 : rec.score)}% התאמה
          </span>
        )}
        <div className="typing-container" key={`title-${playKey}`}>
          <h2 className="mg-feed-title typing-text">{rec.title}</h2>
        </div>
        {rec.description && <p className="mg-feed-desc typing-desc" key={`desc-${playKey}`}>{rec.description}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {rec.category && <span className="mg-feed-category">{rec.category}</span>}
          {rec.estimated_price != null && <span className="mg-feed-category">₪{rec.estimated_price}</span>}
        </div>

        <div className="mg-feed-rating-area">
          <div className="find-gift-fit-actions">
            <button type="button" className={`find-gift-fit-btn not-fit${fit === 'NOT_FIT' ? ' active' : ''}`} onClick={() => handleFit('NOT_FIT')}>
              <span className="material-symbols-outlined">close</span>
              לא מתאים
            </button>
            <button type="button" className={`find-gift-fit-btn fit${fit === 'FIT' ? ' active' : ''}`} onClick={() => handleFit('FIT')}>
              <span className="material-symbols-outlined">favorite</span>
              מתאים!
            </button>
          </div>
          {rec.search_query && (
            <a className="mg-feed-search" href={`https://www.google.com/search?q=${encodeURIComponent(rec.search_query)}`} target="_blank" rel="noreferrer">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
              חפש ב-Google
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function EndOfFeed({ onMore, loading }: { onMore: () => void; loading: boolean }) {
  return (
    <section className="mg-feed-item mg-feed-end">
      <span className="material-symbols-outlined mg-feed-end-icon">check_circle</span>
      <h2>אלה כל ההצעות להיום</h2>
      <p>אפשר לבקש עוד רעיונות, או לחזור מאוחר יותר.</p>
      <button className="btn-filled" onClick={onMore} disabled={loading}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
        {loading ? 'מחשב...' : 'עוד רעיונות'}
      </button>
    </section>
  );
}

export default function FindGiftPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [eventId, setEventId] = useState<string | null>(searchParams.get('event'));
  const [noEvents, setNoEvents] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useShellConfig({ fullBleed: true });

  useEffect(() => {
    if (!id) return;
    api.contacts.get(id).then(setContact).catch(err => logger.error('Load contact failed', err));
  }, [id]);

  // Resolve which event to generate for: the one passed via ?event=, or the contact's soonest.
  useEffect(() => {
    if (!id || eventId) return;
    api.events.list(id).then((events: Event[]) => {
      const soonest = events
        .map(ev => ({ ev, occurrence: nextEventOccurrence(ev) }))
        .filter((x): x is { ev: Event; occurrence: Date } => x.occurrence !== null)
        .sort((a, b) => daysUntil(a.occurrence) - daysUntil(b.occurrence))[0];
      if (soonest) setEventId(soonest.ev.id);
      else setNoEvents(true);
    }).catch(err => logger.error('Load events failed', err));
  }, [id, eventId]);

  async function generateMore() {
    if (!id || !eventId) return;
    setGenerating(true);
    try {
      const result: any = await api.recommendations.generate({ contact_id: id, event_id: eventId });
      const recs: any[] = result.recommendations ?? result;
      setRecommendations(r => [...r, ...recs]);
    } catch (err) {
      logger.error('Generate failed', err);
      alert((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!id || !eventId) return;
    setLoading(true);
    api.recommendations.list(id, eventId).then(async existing => {
      if (existing.length > 0) {
        setRecommendations(existing);
        setLoading(false);
      } else {
        await generateMore();
        setLoading(false);
      }
    }).catch(err => {
      logger.error('Load recommendations failed', err);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, eventId]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('.mg-feed-item'));
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) setActiveIndex(items.indexOf(visible.target as HTMLElement));
      },
      { root: container, threshold: 0.6 },
    );
    items.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [recommendations, loading]);

  const contactName = useMemo(() => (contact?.user_profile as any)?.display_name ?? contact?.name ?? '', [contact]);
  const dotCount = recommendations.length + 1;

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <button type="button" className="find-gift-back-btn" onClick={() => navigate(-1)} title="חזרה">
        <span className="material-symbols-outlined">chevron_right</span>
      </button>
      {contactName && <div className="find-gift-header-label">מתנה עבור {contactName}</div>}

      {noEvents ? (
        <div className="empty-state" style={{ marginTop: 100 }}>
          <span className="material-symbols-outlined">event_busy</span>
          {contactName ? `ל${contactName} אין עדיין אירועים` : 'אין עדיין אירועים'} — הוסף אירוע כדי לקבל המלצות מתנה.
          <button className="btn-filled" style={{ marginTop: 16 }} onClick={() => navigate(`/contact/${id}`)}>לפרופיל</button>
        </div>
      ) : loading ? (
        <div className="ai-loader" style={{ paddingTop: 120 }}>
          <div className="ai-loader-dots"><span /><span /><span /></div>
          <p className="ai-loader-text">✨ ה-AI מחפש מתנות מושלמות...</p>
        </div>
      ) : (
        <div className="mg-feed-wrap">
          <div className="mg-feed hide-scrollbar" ref={feedRef}>
            {recommendations.map((r, i) => <GiftCard key={r.id} rec={r} isActive={i === activeIndex} />)}
            <EndOfFeed onMore={generateMore} loading={generating} />
          </div>

          {dotCount > 1 && (
            <div className="mg-feed-dots">
              {Array.from({ length: dotCount }).map((_, i) => (
                <div key={i} className={`mg-feed-dot${i === activeIndex ? ' active' : ''}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
