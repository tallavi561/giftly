import { calcAge } from '../lib/utils.js';

interface Props {
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  avatarMode?: 'illustrated' | 'silhouette' | 'photo' | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

function initial(name: string) {
  return name?.trim()?.[0] ?? '?';
}

type AgeBracket = 'child' | 'teen' | 'young_adult' | 'adult' | 'senior' | 'elder';

function ageBracket(age: number | null): AgeBracket {
  if (age == null) return 'young_adult';
  if (age <= 13) return 'child';
  if (age <= 18) return 'teen';
  if (age <= 29) return 'young_adult';
  if (age <= 50) return 'adult';
  if (age <= 70) return 'senior';
  return 'elder';
}

const BRACKET_CONFIG: Record<AgeBracket, { headScale: number; bodyScale: number; hairTone: 'dark' | 'gray' | 'white'; glasses: boolean }> = {
  child:       { headScale: 1.20, bodyScale: 0.82, hairTone: 'dark',  glasses: false },
  teen:        { headScale: 1.08, bodyScale: 0.92, hairTone: 'dark',  glasses: false },
  young_adult: { headScale: 1.00, bodyScale: 1.00, hairTone: 'dark',  glasses: false },
  adult:       { headScale: 1.00, bodyScale: 1.00, hairTone: 'dark',  glasses: false },
  senior:      { headScale: 1.00, bodyScale: 1.00, hairTone: 'gray',  glasses: true },
  elder:       { headScale: 1.00, bodyScale: 1.00, hairTone: 'white', glasses: true },
};

const HAIR_COLORS: Record<'male' | 'female', Record<'dark' | 'gray' | 'white', string>> = {
  male:   { dark: '#2e2018', gray: '#8a8a8a', white: '#dcd8ce' },
  female: { dark: '#4a2e1e', gray: '#93877e', white: '#e2ddd2' },
};

function Glasses() {
  return (
    <g stroke="#3a3a3a" strokeWidth="1.3" fill="none" opacity={0.85}>
      <ellipse cx="42" cy="41" rx="5.2" ry="4.2" />
      <ellipse cx="58" cy="41" rx="5.2" ry="4.2" />
      <line x1="47.2" y1="41" x2="52.8" y2="41" />
      <line x1="36.8" y1="40" x2="32" y2="37.5" />
      <line x1="63.2" y1="40" x2="68" y2="37.5" />
    </g>
  );
}

// Cute "gift topper" bust illustration, shared skeleton — hair, head/body
// scale (younger = bigger head, smaller shoulders), and hair tone/glasses
// (older brackets) are what vary. Every avatar wears a little bow, like a
// gift tag come to life.
function Bust({ hair, bracket }: { hair: 'male' | 'female'; bracket: AgeBracket }) {
  const cfg = BRACKET_CONFIG[bracket];
  const hairColor = HAIR_COLORS[hair][cfg.hairTone];

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-hidden="true">
      <defs>
        <radialGradient id={`av-bg-${hair}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={hair === 'male' ? '#8f89f0' : '#f7c2c2'} />
          <stop offset="100%" stopColor={hair === 'male' ? '#5851DB' : '#c2185b'} />
        </radialGradient>
        <linearGradient id={`av-skin-${hair}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd9b3" />
          <stop offset="100%" stopColor="#f3bd8e" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="50" fill={`url(#av-bg-${hair})`} />

      {/* shoulders / shirt — narrower for younger brackets */}
      <g transform={`translate(50 100) scale(${cfg.bodyScale} 1) translate(-50 -100)`}>
        <path d="M18 100 C18 78 32 68 50 68 C68 68 82 78 82 100 Z" fill="rgba(255,255,255,0.92)" />
      </g>

      {/* head group — scaled up for younger brackets (bigger head-to-body ratio) */}
      <g transform={`translate(50 42) scale(${cfg.headScale}) translate(-50 -42)`}>
        <rect x="43" y="55" width="14" height="16" rx="6" fill={`url(#av-skin-${hair})`} />
        <ellipse cx="50" cy="42" rx="21" ry="22" fill={`url(#av-skin-${hair})`} />

        {hair === 'male' ? (
          <path d="M30 27 C30 12 70 12 70 27 L30 27 Z" fill={hairColor} />
        ) : (
          <>
            <path d="M27 39 C27 8 73 8 73 39 L27 39 Z" fill={hairColor} />
            <path d="M28 34 C24 48 23 66 27 85 C29 90 34 91 36 86 C33 72 33 54 37 38 Z" fill={hairColor} />
            <path d="M72 34 C76 48 77 66 73 85 C71 90 66 91 64 86 C67 72 67 54 63 38 Z" fill={hairColor} />
          </>
        )}

        <circle cx="40" cy="46" r="2.6" fill="#e88a6a" opacity="0.5" />
        <circle cx="60" cy="46" r="2.6" fill="#e88a6a" opacity="0.5" />
        <circle cx="42" cy="41" r="2.1" fill="#2a2018" />
        <circle cx="58" cy="41" r="2.1" fill="#2a2018" />
        <path d="M45 49 Q50 53 55 49" stroke="#2a2018" strokeWidth="1.6" fill="none" strokeLinecap="round" />

        {cfg.glasses && <Glasses />}

        {/* gift-bow topper */}
        <g transform="translate(50 11)">
          <path d="M0 3 C-9 -6 -17 1 -9 6 C-17 8 -9 15 0 6 Z" fill="#f7c15c" stroke="#b8791a" strokeWidth="1" />
          <path d="M0 3 C9 -6 17 1 9 6 C17 8 9 15 0 6 Z" fill="#f7c15c" stroke="#b8791a" strokeWidth="1" />
          <circle cx="0" cy="4" r="3.4" fill="#e8a33d" stroke="#b8791a" strokeWidth="1" />
        </g>
      </g>
    </svg>
  );
}

export default function Avatar({ name, gender, birthDate, avatarMode, avatarUrl, size = 48, className }: Props) {
  const isMale = gender === 'male';
  const isFemale = gender === 'female';

  if (avatarMode === 'photo' && avatarUrl) {
    return (
      <div className={`avatar-photo${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
        <img src={avatarUrl} alt={name} />
      </div>
    );
  }

  if (avatarMode === 'silhouette') {
    return (
      <div
        className={`avatar-fallback${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: size * 0.56 }}>person</span>
      </div>
    );
  }

  if (!isMale && !isFemale) {
    return (
      <div
        className={`avatar-fallback${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {initial(name)}
      </div>
    );
  }

  return (
    <div
      className={`avatar-illustrated${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <Bust hair={isMale ? 'male' : 'female'} bracket={ageBracket(calcAge(birthDate ?? null))} />
    </div>
  );
}
