import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('MyGiftsPage');

interface SelfSuggestion {
  id: string;
  title: string;
  description: string | null;
  estimated_price: number | null;
  category: string | null;
  search_query: string | null;
  rating: number | null;
  created_at: string;
}

function StarRating({ value, onChange }: { value: number | null; onChange: (r: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;
  return (
    <div className="star-rating" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`star-btn${display >= n ? ' filled' : ''}`}
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
          title={`${n} כוכבים`}
        >
          <span className={`material-symbols-outlined${display >= n ? ' icon-fill' : ''}`}>star</span>
        </button>
      ))}
    </div>
  );
}

export default function MyGiftsPage() {
  const navigate = useNavigate();
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

  const rated = suggestions.filter(s => s.rating !== null);
  const unrated = suggestions.filter(s => s.rating === null);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="top-bar-brand">
            <img src="/logo.png" alt="Giftly" />
          </div>
          <div className="top-bar-actions">
            <button className="btn-surface" onClick={() => navigate('/')} style={{ gap: 6, display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              חזרה
            </button>
          </div>
        </div>
      </header>

      <div className="profile-page-body">
        <div style={{ width: '100%', maxWidth: 860 }}>
          <div className="profile-page-header" style={{ marginBottom: 24 }}>
            <span className="material-symbols-outlined profile-page-icon">favorite</span>
            <div>
              <h1>המתנות שלי</h1>
              <p>הצעות מתנה שנוצרו עבורך — דרג כדי לעזור למערכת ללמוד את הטעם שלך</p>
            </div>
          </div>

          {loading ? (
            <div className="ai-loader" style={{ paddingTop: 64 }}>
              <div className="ai-loader-dots"><span /><span /><span /></div>
              <p className="ai-loader-text">טוען...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">card_giftcard</span>
              <p>אין עדיין הצעות. לחץ על "צור הצעות לכולם" כדי להפעיל את מנוע ה-AI.</p>
            </div>
          ) : (
            <>
              {unrated.length > 0 && (
                <section style={{ marginBottom: 40 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
                    ממתינות לדירוג ({unrated.length})
                  </h2>
                  <div className="recs-grid">
                    {unrated.map(s => (
                      <SuggestionCard key={s.id} s={s} onRate={handleRate} />
                    ))}
                  </div>
                </section>
              )}

              {rated.length > 0 && (
                <section>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 16 }}>
                    דורגו ({rated.length})
                  </h2>
                  <div className="recs-grid">
                    {rated.map(s => (
                      <SuggestionCard key={s.id} s={s} onRate={handleRate} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ s, onRate }: { s: SelfSuggestion; onRate: (id: string, r: number) => void }) {
  return (
    <div className={`rec-card${s.rating !== null ? ' rec-card-rated' : ''}`}>
      {s.category && <span className="rec-card-category">{s.category}</span>}
      <p className="rec-card-title">{s.title}</p>
      {s.description && <p className="rec-card-desc">{s.description}</p>}
      <div className="rec-card-footer">
        {s.estimated_price && <span className="rec-card-price">~{s.estimated_price} ₪</span>}
        {s.search_query && (
          <a
            className="rec-card-link"
            href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            חיפוש בגוגל
          </a>
        )}
      </div>
      <StarRating value={s.rating} onChange={r => onRate(s.id, r)} />
    </div>
  );
}
