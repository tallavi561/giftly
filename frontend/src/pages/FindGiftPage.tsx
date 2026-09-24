import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import { useShellConfig } from '../components/AppShellLayout.js';
import { gradientForCategory } from '../lib/utils.js';
import { nextEventOccurrence, daysUntil } from '../lib/utils.js';
import type { Contact, Event, Recommendation } from '../types/index.js';

const logger = new Logger('FindGiftPage');

// Dedicated full-screen swipe feed for finding a gift for one contact —
// replaces the old "buried horizontal carousel below the profile" flow
// (see Specs/Front/FRONTEND_SPEC2.md §9(4)). Sourced from the same
// POST /api/recommendations the old inline carousel used; "load more" and
// fit/not-fit now call the real backend (Phase 2 — search-more + binary rate).

function GiftCard({ rec, isActive, onRate }: { rec: Recommendation; isActive: boolean; onRate: (id: string, fit: 'FIT' | 'NOT_FIT') => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [playKey, setPlayKey] = useState(0);
  const fit = rec.rating === 5 ? 'FIT' : rec.rating === 2 ? 'NOT_FIT' : null;

  useEffect(() => { if (isActive) setPlayKey(k => k + 1); }, [isActive]);

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
            <button type="button" className={`find-gift-fit-btn not-fit${fit === 'NOT_FIT' ? ' active' : ''}`} onClick={() => onRate(rec.id, 'NOT_FIT')}>
              <span className="material-symbols-outlined">close</span>
              לא מתאים
            </button>
            <button type="button" className={`find-gift-fit-btn fit${fit === 'FIT' ? ' active' : ''}`} onClick={() => onRate(rec.id, 'FIT')}>
              <span className="material-symbols-outlined">favorite</span>
              מתאים!
            </button>
          </div>
          {rec.source_url ? (
            <a className="mg-feed-search" href={rec.source_url} target="_blank" rel="noreferrer">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
              לצפייה במוצר
            </a>
          ) : rec.search_query && (
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

function EndOfFeed({ onMore, loading, done }: { onMore: () => void; loading: boolean; done: boolean }) {
  return (
    <section className="mg-feed-item mg-feed-end">
      <span className="material-symbols-outlined mg-feed-end-icon">check_circle</span>
      <h2>אלה כל ההצעות להיום</h2>
      <p>{done ? 'אין עוד הצעות זמינות כרגע לאיש הקשר הזה — נסה שוב מאוחר יותר.' : 'אפשר לטעון עוד הצעות מהרשימה המדורגת.'}</p>
      {!done && (
        <button className="btn-filled" onClick={onMore} disabled={loading}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
          {loading ? 'טוען...' : 'עוד הצעות'}
        </button>
      )}
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
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

  useEffect(() => {
    if (!id || !eventId) return;
    setLoading(true);
    api.recommendations.list(id, eventId).then(async existing => {
      if (existing.length > 0) {
        setRecommendations(existing);
        setLoading(false);
        return;
      }
      try {
        const result: any = await api.recommendations.generate({ contact_id: id, event_id: eventId });
        setRecommendations(result.recommendations ?? []);
      } catch (err) {
        logger.error('Generate failed', err);
        alert((err as Error).message);
      } finally {
        setLoading(false);
      }
    }).catch(err => {
      logger.error('Load recommendations failed', err);
      setLoading(false);
    });
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

  async function handleLoadMore() {
    if (!id) return;
    const batchId = recommendations[0]?.batch_id;
    if (!batchId) return;
    setLoadingMore(true);
    try {
      const result = await api.recommendations.searchMore(id, batchId);
      if (result.items.length > 0) setRecommendations(r => [...r, ...result.items]);
      if (result.done) setSessionDone(true);
    } catch (err) {
      logger.error('Search-more failed', err);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRate(recId: string, fit: 'FIT' | 'NOT_FIT') {
    setRecommendations(prev => prev.map(r => r.id === recId ? { ...r, rating: fit === 'FIT' ? 5 : 2 } : r));
    try {
      await api.recommendations.rate(recId, fit);
    } catch (err) {
      logger.error('Rate failed', err);
    }
  }

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
            {recommendations.map((r, i) => <GiftCard key={r.id} rec={r} isActive={i === activeIndex} onRate={handleRate} />)}
            <EndOfFeed onMore={handleLoadMore} loading={loadingMore} done={sessionDone} />
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
