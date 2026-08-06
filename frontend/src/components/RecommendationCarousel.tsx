import { useRef } from 'react';
import type { Recommendation } from '../types/index.js';
import { gradientForCategory } from '../lib/utils.js';

interface Props {
  items: Recommendation[];
}

export default function RecommendationCarousel({ items }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  function nudge(dir: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>('.tag-card');
    const amount = (card?.offsetWidth ?? 250) + 20;
    track.scrollBy({ left: dir * amount, behavior: 'smooth' });
  }

  return (
    <div className="tag-row">
      <div className="tag-track" ref={trackRef}>
        {items.map(r => (
          <article key={r.id} className="tag-card ai-border tag-card-media">
            <div className="tag-card-img" style={{ background: gradientForCategory(r.category) }}>
              {r.image_url && <img src={r.image_url} alt={r.title} />}
              {r.score != null && (
                <span className="tag-card-match">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>star</span>
                  {Math.round(r.score <= 1 ? r.score * 100 : r.score)}% התאמה
                </span>
              )}
            </div>
            <div className="tag-card-body">
              <div className="tag-card-top">
                {r.category && <span className="tag-chip">{r.category}</span>}
              </div>
              <h3 className="tag-title">{r.title}</h3>
              {r.description && <p className="tag-desc">{r.description}</p>}
              <div className="tag-card-footer">
                {r.estimated_price != null && <span className="tag-price">₪{r.estimated_price}</span>}
                <a
                  className="tag-link"
                  href={`https://www.google.com/search?q=${encodeURIComponent(r.search_query ?? r.title)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>search</span>
                  חיפוש בגוגל
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <div className="tag-row-nav">
          <button type="button" className="tag-row-btn" onClick={() => nudge(-1)} aria-label="גלול">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <button type="button" className="tag-row-btn" onClick={() => nudge(1)} aria-label="גלול">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
        </div>
      )}
    </div>
  );
}
