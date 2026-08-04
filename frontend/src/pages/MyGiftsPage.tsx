import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';
import AppShellLayout from '../components/AppShellLayout.js';

const logger = new Logger('MyGiftsPage');

interface SelfSuggestion {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  search_query: string | null;
  rating: number | null;
  created_at: string;
}

const CATEGORY_COLORS = [
  { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
  { bg: 'var(--tertiary-fixed)',       color: 'var(--on-tertiary-fixed-variant)' },
  { bg: 'var(--primary-fixed)',        color: 'var(--primary)' },
];

function categoryStyle(category: string | null) {
  if (!category) return CATEGORY_COLORS[0];
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx];
}

function StarRating({ value, onChange }: { value: number | null; onChange: (r: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;
  const isRated = value !== null;
  return (
    <div className="mg-star-rating" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`mg-star-btn${display >= n ? ' active' : ''}`}
          style={{ color: isRated && display >= n ? 'var(--primary)' : undefined }}
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: display >= n ? "'FILL' 1" : "'FILL' 0" }}
          >star</span>
        </button>
      ))}
    </div>
  );
}

export default function MyGiftsPage() {
  const [suggestions, setSuggestions] = useState<SelfSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.selfRecommendations.list().then(data => {
      setSuggestions(data);
      setLoading(false);
    }).catch(err => {
      logger.error('Load self suggestions failed', err);
      setLoading(false);
    });
  }, []);

  async function handleRate(id: string, rating: number) {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, rating } : s));
    try {
      await api.selfRecommendations.rate(id, rating);
    } catch (err) {
      logger.error('Rate failed', err);
    }
  }

  const unrated = suggestions.filter(s => s.rating === null);
  const rated   = suggestions.filter(s => s.rating !== null);

  return (
    <AppShellLayout>
      <div className="mg-main">
        {/* Hero */}
        <section className="mg-hero">
          <h1>המתנות שלי</h1>
          <p>המלצות AI שנבחרו במיוחד בשבילך</p>
        </section>

        {loading ? (
          <div className="ai-loader" style={{ paddingTop: 80 }}>
            <div className="ai-loader-dots"><span /><span /><span /></div>
            <p className="ai-loader-text">טוען...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {unrated.length > 0 && (
              <section className="mg-section">
                <div className="mg-section-header">
                  <h2>הצעות חדשות</h2>
                  <div className="mg-divider" />
                </div>
                <div className="mg-grid">
                  {unrated.map(s => <UnratedCard key={s.id} s={s} onRate={handleRate} />)}
                </div>
              </section>
            )}

            {rated.length > 0 && (
              <section className="mg-section">
                <div className="mg-section-header">
                  <h2>מתנות שדורגו</h2>
                  <div className="mg-divider" />
                </div>
                <div className="mg-grid mg-grid-rated">
                  {rated.map(s => <RatedCard key={s.id} s={s} onRate={handleRate} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShellLayout>
  );
}

function UnratedCard({ s, onRate }: { s: SelfSuggestion; onRate: (id: string, r: number) => void }) {
  const cat = categoryStyle(s.category);
  return (
    <article className="mg-card mg-card-unrated">
      <div className="mg-card-top">
        {s.category && (
          <span className="mg-category-tag" style={{ background: cat.bg, color: cat.color }}>
            {s.category}
          </span>
        )}
      </div>
      <div className="mg-card-body">
        <h3>{s.title}</h3>
        {s.description && <p>{s.description}</p>}
      </div>
      <div className="mg-card-footer">
        <StarRating value={s.rating} onChange={r => onRate(s.id, r)} />
        {s.search_query && (
          <a
            className="mg-search-btn"
            href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
            חפש ב-Google
          </a>
        )}
      </div>
    </article>
  );
}

function RatedCard({ s, onRate }: { s: SelfSuggestion; onRate: (id: string, r: number) => void }) {
  return (
    <article className="mg-card mg-card-rated">
      <div className="mg-card-top">
        {s.category && (
          <span className="mg-category-tag mg-category-tag-muted">{s.category}</span>
        )}
        <span
          className="material-symbols-outlined"
          style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1", fontSize: 20 }}
        >check_circle</span>
      </div>
      <div className="mg-card-body">
        <h3>{s.title}</h3>
        <p>דירגת מוצר זה ב-{s.rating} כוכבים</p>
      </div>
      <div className="mg-card-footer">
        <StarRating value={s.rating} onChange={r => onRate(s.id, r)} />
      </div>
    </article>
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
