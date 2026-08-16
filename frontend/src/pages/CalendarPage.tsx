import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { hebrewToGregorianInYear, formatHebrewDate } from '../lib/hebrewDate.js';

interface CalendarEvent {
  id: string;
  contact_id: string;
  contact_name: string;
  event_type: string;
  event_name: string;
  date: string;
  date_type: 'gregorian' | 'hebrew';
  year?: number | null;
}

const MONTH_NAMES = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'
];

const DAY_LABELS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

function eventIcon(type: string) {
  switch (type) {
    case 'יום הולדת':   return { icon: 'cake',             color: 'var(--primary)',             label: 'יום הולדת' };
    case 'יום נישואין': return { icon: 'favorite',         color: 'var(--error)',               label: 'יום נישואין' };
    case 'סיום לימודים':return { icon: 'menu_book',        color: 'var(--tertiary)',            label: 'סיום לימודים' };
    case 'חג':          return { icon: 'star',             color: '#c8860a',                   label: 'חג' };
    case 'חנוכת בית':  return { icon: 'home',             color: '#2e7d32',                   label: 'חנוכת בית' };
    case 'קידום בעבודה':return { icon: 'workspace_premium',color: '#7b1fa2',                   label: 'קידום בעבודה' };
    default:            return { icon: 'event',            color: 'var(--on-surface-variant)',  label: type || 'אירוע' };
  }
}

function parseDateToMonthDay(dateStr: string): { month: number; day: number } | null {
  const parts = dateStr.split('-');
  if (parts.length === 3) return { month: parseInt(parts[1]) - 1, day: parseInt(parts[2]) };
  if (parts.length === 2) return { month: parseInt(parts[0]) - 1, day: parseInt(parts[1]) };
  return null;
}

function resolveMonthDay(ev: CalendarEvent, year: number): { month: number; day: number } | null {
  if (ev.date_type === 'hebrew') return hebrewToGregorianInYear(ev.date, year);
  return parseDateToMonthDay(ev.date);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  // 0=Sun, but our grid starts Sunday (index 0 = א')
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.contacts.list(), api.events.list()]).then(([contacts, evts]) => {
      const contactMap: Record<string, string> = {};
      contacts.forEach((c: any) => { contactMap[c.id] = c.name ?? c.display_name ?? 'איש קשר'; });
      const mapped: CalendarEvent[] = evts.map((e: any) => ({
        id: e.id,
        contact_id: e.contact_id,
        contact_name: contactMap[e.contact_id] ?? 'איש קשר',
        event_type: e.type ?? 'אחר',
        event_name: e.type ?? '',
        date: e.date ?? '',
        date_type: e.date_type ?? 'gregorian',
        year: e.year ?? null,
      }));
      setEvents(mapped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Map month+day → events for the current view month
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    events.forEach(ev => {
      const md = resolveMonthDay(ev, viewYear);
      if (!md) return;
      if (md.month !== viewMonth) return;
      if (!map[md.day]) map[md.day] = [];
      map[md.day].push(ev);
    });
    return map;
  }, [events, viewMonth]);

  // Upcoming events across the WHOLE year, sorted by next occurrence
  const upcomingEvents = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result: Array<{ ev: CalendarEvent; nextDate: Date }> = [];
    events.forEach(ev => {
      let md = resolveMonthDay(ev, today.getFullYear());
      if (!md) return;
      let candidate = new Date(today.getFullYear(), md.month, md.day);
      if (candidate < today) {
        // try next Gregorian year (Hebrew dates may shift)
        md = resolveMonthDay(ev, today.getFullYear() + 1) ?? md;
        candidate = new Date(today.getFullYear() + 1, md.month, md.day);
      }
      result.push({ ev, nextDate: candidate });
    });
    result.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    return result.slice(0, 10);
  }, [events]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfWeek(viewYear, viewMonth);
  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  // Format date for upcoming list
  function formatUpcomingDate(d: Date) {
    return `${d.getDate()} ב${MONTH_NAMES[d.getMonth()]}`;
  }

  // Group upcoming by date string
  const upcomingGrouped = useMemo(() => {
    const groups: Array<{ label: string; evts: CalendarEvent[] }> = [];
    let lastLabel = '';
    upcomingEvents.forEach(({ ev, nextDate }) => {
      const label = formatUpcomingDate(nextDate);
      if (label !== lastLabel) {
        groups.push({ label, evts: [ev] });
        lastLabel = label;
      } else {
        groups[groups.length - 1].evts.push(ev);
      }
    });
    return groups;
  }, [upcomingEvents]);

  const isToday = (day: number) =>
    day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();

  return (
    <>
      <div className="cal-main">
        {/* Header */}
        <div className="cal-header">
          <h1>לוח שנה</h1>
          <div className="cal-month-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
            <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button className="cal-nav-btn" onClick={nextMonth}>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          </div>
        </div>

        <div className="cal-body">
          {/* Left: Calendar + selected day */}
          <div className="cal-left">
            {/* Calendar grid */}
            <div className="cal-card">
              {/* Day labels */}
              <div className="cal-grid cal-grid-labels">
                {DAY_LABELS.map(l => (
                  <div key={l} className="cal-day-label">{l}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="cal-grid">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`e${i}`} className="cal-cell" />
                ))}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const dayEvents = eventsByDay[day] ?? [];
                  const active = selectedDay === day;
                  const today = isToday(day);
                  const dotColor = dayEvents.length > 0 ? eventIcon(dayEvents[0].event_type).color : null;
                  return (
                    <div
                      key={day}
                      className={`cal-cell cal-day${active ? ' cal-day-active' : ''}${today ? ' cal-day-today' : ''}`}
                      style={dotColor && !today ? { background: `${dotColor}14` } : undefined}
                      onClick={() => setSelectedDay(day)}
                    >
                      <span className="cal-day-num">{day}</span>
                      {dotColor && <div className="cal-day-dot" style={{ background: dotColor }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected day events */}
            {selectedDay !== null && (
              <div className="cal-selected-events">
                <div className="cal-section-title">
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>event_note</span>
                  <h2>אירועים ב-{selectedDay} ב{MONTH_NAMES[viewMonth]}</h2>
                </div>
                {loading ? (
                  <div className="ai-loader"><div className="ai-loader-dots"><span/><span/><span/></div></div>
                ) : selectedEvents.length === 0 ? (
                  <p className="cal-no-events">אין אירועים ביום זה</p>
                ) : (
                  <div className="cal-event-cards">
                    {selectedEvents.map(ev => {
                      const { icon, color, label } = eventIcon(ev.event_type);
                      return (
                        <div key={ev.id} className="cal-event-card">
                          <div className="cal-event-icon-wrap" style={{ background: `${color}1a` }}>
                            <span
                              className="material-symbols-outlined"
                              style={{ color, fontVariationSettings: "'FILL' 1" }}
                            >{icon}</span>
                          </div>
                          <div className="cal-event-info">
                            <div className="cal-event-name">{ev.contact_name}</div>
                            <div className="cal-event-contact">
                              <span className="cal-event-type-label" style={{ color }}>{label}</span>
                              {ev.date_type === 'hebrew' && (
                                <span className="cal-hebrew-badge">{formatHebrewDate(ev.date)}</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="cal-goto-btn"
                            onClick={() => navigate(`/contact/${ev.contact_id}/find-gift?event=${ev.id}`)}
                          >
                            מצא מתנה
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upcoming events */}
          <div className="cal-upcoming-section">
            <div className="cal-section-title">
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>upcoming</span>
              <h2>אירועים קרובים</h2>
            </div>
            {loading ? (
              <div className="ai-loader"><div className="ai-loader-dots"><span/><span/><span/></div></div>
            ) : upcomingGrouped.length === 0 ? (
              <p className="cal-no-events">אין אירועים קרובים</p>
            ) : (
              <div className="cal-event-cards">
                {upcomingGrouped.map((group, gi) => (
                  <div key={gi} className="cal-upcoming-group">
                    <span className="cal-upcoming-date">{group.label}</span>
                    {group.evts.map(ev => {
                      const { icon, color, label } = eventIcon(ev.event_type);
                      return (
                        <div key={ev.id} className="cal-event-card">
                          <div className="cal-event-icon-wrap" style={{ background: `${color}1a` }}>
                            <span className="material-symbols-outlined" style={{ color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                          </div>
                          <div className="cal-event-info">
                            <div className="cal-event-name">{ev.contact_name}</div>
                            <div className="cal-event-contact">
                              <span className="cal-event-type-label" style={{ color }}>{label}</span>
                              {ev.date_type === 'hebrew' && (
                                <span className="cal-hebrew-badge">{formatHebrewDate(ev.date)}</span>
                              )}
                            </div>
                          </div>
                          <button className="cal-goto-btn" onClick={() => navigate(`/contact/${ev.contact_id}/find-gift?event=${ev.id}`)}>
                            מצא מתנה
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
