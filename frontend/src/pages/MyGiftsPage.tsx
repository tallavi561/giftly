import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import { useShellConfig } from '../components/AppShellLayout.js';
import { gradientForCategory } from '../lib/utils.js';

const logger = new Logger('MyGiftsPage');

interface SelfSuggestion {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  search_query: string | null;
  rating: number | null;
  created_at: string;
  image_url?: string | null; // not populated by the backend yet — falls back to a placeholder
}

type FeedbackReason = 'WRONG_CONCEPT' | 'WRONG_PRODUCT' | 'TOO_GENERIC';
const REASON_LABELS: Record<FeedbackReason, string> = {
  WRONG_CONCEPT: 'הכיוון לא מתאים לי',
  WRONG_PRODUCT: 'הרעיון בסדר, המוצר הזה לא',
  TOO_GENERIC: 'לא מספיק מיוחד',
};

function burstCelebration(container: HTMLElement) {
  const colors = ['#D4AF37', '#5851DB', '#ffffff'];
  const symbols = ['star', 'favorite', 'auto_awesome'];
  for (let i = 0; i < 16; i++) {
    const particle = document.createElement('span');
    particle.className = 'material-symbols-outlined mg-particle';
    particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    particle.style.color = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = (35 + Math.random() * 30) + '%';
    particle.style.bottom = '140px';
    particle.style.fontSize = (20 + Math.random() * 20) + 'px';
    particle.style.fontVariationSettings = "'FILL' 1";
    const duration = 0.8 + Math.random() * 0.7;
    const tx = (Math.random() * 200 - 100) + 'px';
    const ty = -(100 + Math.random() * 180) + 'px';
    particle.animate(
      [
        { transform: 'translate(0,0) scale(0.5)', opacity: 1 },
        { transform: `translate(${tx}, ${ty}) scale(1.4) rotate(${Math.random() * 180}deg)`, opacity: 0 },
      ],
      { duration: duration * 1000, easing: 'ease-out', fill: 'forwards' },
    );
    container.appendChild(particle);
    setTimeout(() => particle.remove(), duration * 1000);
  }
}

function StarRating({ value, big, onChange }: { value: number | null; big?: boolean; onChange: (r: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;
  return (
    <div className={`mg-star-rating${big ? ' big' : ''}`} onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`mg-star-btn${display >= n ? ' active' : ''}`}
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: display >= n ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
      ))}
    </div>
  );
}

function FeedCard({ s, isActive, onRate }: { s: SelfSuggestion; isActive: boolean; onRate: (id: string, r: number, reason?: FeedbackReason) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Bump on every activation so the title/description key changes below force
  // a remount, replaying the reveal animation each time the card is scrolled to
  // (CSS animations only auto-play once, at mount).
  const [playKey, setPlayKey] = useState(0);
  useEffect(() => {
    if (isActive) setPlayKey(k => k + 1);
  }, [isActive]);

  // A rating of 3 or below requires a reason before it's sent (backend §7.1) —
  // hold the star click here and ask, rather than submitting immediately.
  const [pendingRating, setPendingRating] = useState<number | null>(null);

  function handleStarClick(r: number) {
    if (r <= 3) { setPendingRating(r); return; }
    setPendingRating(null);
    onRate(s.id, r);
    if (r === 5 && cardRef.current) burstCelebration(cardRef.current);
  }

  function handleReasonPick(reason: FeedbackReason) {
    if (pendingRating === null) return;
    onRate(s.id, pendingRating, reason);
    setPendingRating(null);
  }

  return (
    <section className="mg-feed-item" ref={cardRef}>
      {s.image_url ? (
        <img className="mg-feed-img" src={s.image_url} alt={s.title} />
      ) : (
        <div className="mg-feed-img mg-feed-placeholder" style={{ background: gradientForCategory(s.category) }}>
          <span className="material-symbols-outlined">card_giftcard</span>
        </div>
      )}
      <div className="mg-feed-scrim" />
      <div className="mg-feed-content">
        {s.rating === null ? (
          <span className="mg-feed-badge">הצעה בשבילך</span>
        ) : (
          <span className="mg-feed-badge rated">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
            דורג
          </span>
        )}
        <div className="typing-container" key={`title-${playKey}`}>
          <h2 className="mg-feed-title typing-text">{s.title}</h2>
        </div>
        {s.description && <p className="mg-feed-desc typing-desc" key={`desc-${playKey}`}>{s.description}</p>}
        {s.category && <span className="mg-feed-category">{s.category}</span>}

        <div className="mg-feed-rating-area">
          <p>{s.rating === null ? 'דרג את ההצעה' : `דירגת ב-${s.rating} כוכבים`}</p>
          <StarRating value={pendingRating ?? s.rating} big onChange={handleStarClick} />
          {pendingRating !== null && (
            <div className="mg-feedback-reasons">
              <p>מה בעיקר לא התאים?</p>
              <div className="mg-feedback-reason-chips">
                {(Object.keys(REASON_LABELS) as FeedbackReason[]).map(reason => (
                  <button key={reason} type="button" className="mg-feedback-reason-chip" onClick={() => handleReasonPick(reason)}>
                    {REASON_LABELS[reason]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {s.search_query && (
            <a
              className="mg-feed-search"
              href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
              חפש ב-Google
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function EndOfFeed({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <section className="mg-feed-item mg-feed-end">
      <span className="material-symbols-outlined mg-feed-end-icon">check_circle</span>
      <h2>ראית הכל!</h2>
      <p>הצעות חדשות מתווספות מדי פעם על סמך הפרופיל שלך — בדוק שוב בקרוב.</p>
      <button className="btn-filled" onClick={onRefresh} disabled={refreshing}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
        {refreshing ? 'בודק...' : 'רענן'}
      </button>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mg-empty">
      <span className="material-symbols-outlined mg-empty-icon">card_giftcard</span>
      <h2>כמעט שם...</h2>
      <p>ה-AI שלנו עובד קשה כדי להכיר אותך טוב יותר. ברגע שנסיים לנתח את הפרופיל שלך, המלצות אישיות ומדויקות יופיעו כאן.</p>
    </div>
  );
}

export default function MyGiftsPage() {
  const [suggestions, setSuggestions] = useState<SelfSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  function loadSuggestions() {
    return api.selfRecommendations.list().then(data => {
      setSuggestions(data);
    }).catch(err => {
      logger.error('Load self suggestions failed', err);
    });
  }

  useEffect(() => {
    loadSuggestions().finally(() => setLoading(false));
  }, []);

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
  }, [suggestions, loading]);

  async function handleRate(id: string, rating: number, reason?: FeedbackReason) {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, rating } : s));
    try {
      await api.selfRecommendations.rate(id, rating, reason);
    } catch (err) {
      logger.error('Rate failed', err);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadSuggestions();
    setRefreshing(false);
  }

  function scrollToIndex(idx: number) {
    const container = feedRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>('.mg-feed-item');
    items[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const dotCount = suggestions.length + 1; // + the end-of-feed card

  useShellConfig({ fullBleed: true });

  return (
    <>
      {loading ? (
        <div className="ai-loader" style={{ paddingTop: 80 }}>
          <div className="ai-loader-dots"><span /><span /><span /></div>
          <p className="ai-loader-text">טוען...</p>
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mg-feed-wrap">
          <div className="mg-feed hide-scrollbar" ref={feedRef}>
            {suggestions.map((s, i) => <FeedCard key={s.id} s={s} isActive={i === activeIndex} onRate={handleRate} />)}
            <EndOfFeed onRefresh={handleRefresh} refreshing={refreshing} />
          </div>

          {/* Rendered as a sibling of the scrolling feed (not inside it) so it
              stays put on screen instead of scrolling away with the cards. */}
          {dotCount > 1 && (
            <div className="mg-feed-dots">
              {Array.from({ length: dotCount }).map((_, i) => (
                <div key={i} className={`mg-feed-dot${i === activeIndex ? ' active' : ''}`} />
              ))}
            </div>
          )}

          {/* Desktop-only up/down navigation — mobile keeps plain touch/scroll swiping */}
          {dotCount > 1 && (
            <div className="mg-feed-nav">
              <button
                type="button"
                className="mg-feed-nav-btn"
                onClick={() => scrollToIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
                title="הקודם"
              >
                <span className="material-symbols-outlined">keyboard_arrow_up</span>
              </button>
              <button
                type="button"
                className="mg-feed-nav-btn"
                onClick={() => scrollToIndex(activeIndex + 1)}
                disabled={activeIndex === dotCount - 1}
                title="הבא"
              >
                <span className="material-symbols-outlined">keyboard_arrow_down</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
