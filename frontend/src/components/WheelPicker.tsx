import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

export interface WheelOption {
  value: number;
  label: string;
}

interface Props {
  options: WheelOption[];
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);

/** A scrollable, snap-to-item wheel (iOS-style picker) for one value from a fixed option list. */
export default function WheelPicker({ options, value, onChange, ariaLabel }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  // Guards the programmatic scroll below from re-triggering handleScroll's onChange.
  const isProgrammatic = useRef(false);

  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) < 1) return;
    isProgrammatic.current = true;
    el.scrollTo({ top: target, behavior: 'auto' });
    requestAnimationFrame(() => { isProgrammatic.current = false; });
  }, [selectedIndex]);

  useEffect(() => () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); }, []);

  const handleScroll = useCallback(() => {
    if (isProgrammatic.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    // Fire once scrolling has settled, rather than on every scroll tick.
    scrollTimeout.current = setTimeout(() => {
      const el = listRef.current;
      if (!el) return;
      const idx = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));
      const opt = options[idx];
      if (opt && opt.value !== value) onChange(opt.value);
    }, 120);
  }, [options, value, onChange]);

  function selectIndex(idx: number) {
    const opt = options[idx];
    if (!opt) return;
    if (opt.value !== value) onChange(opt.value);
    listRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') { e.preventDefault(); selectIndex(Math.max(0, selectedIndex - 1)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectIndex(Math.min(options.length - 1, selectedIndex + 1)); }
  }

  return (
    <div className="wheel-picker" style={{ height: ITEM_HEIGHT * VISIBLE_COUNT }}>
      <div className="wheel-picker-highlight" style={{ height: ITEM_HEIGHT, top: PAD }} />
      <ul
        ref={listRef}
        className="wheel-picker-list"
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{ paddingBlock: PAD }}
      >
        {options.map((opt, idx) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            className={`wheel-picker-item${opt.value === value ? ' selected' : ''}`}
            style={{ height: ITEM_HEIGHT }}
            onClick={() => selectIndex(idx)}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
