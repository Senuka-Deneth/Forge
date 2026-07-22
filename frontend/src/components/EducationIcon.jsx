import React from 'react';
import { ICONS as EDU_ICONS, resolveIconId } from '../data/educationData';

const iconStyle = { display: 'flex', alignItems: 'center', width: 18, height: 18, flexShrink: 0 };

function NavIcon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={iconStyle}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  'last-price': (
    <NavIcon>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </NavIcon>
  ),
  'price-change': (
    <NavIcon>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </NavIcon>
  ),
  volume: (
    <NavIcon>
      <rect x="18" y="3" width="4" height="18" />
      <rect x="10" y="8" width="4" height="13" />
      <rect x="2" y="13" width="4" height="8" />
    </NavIcon>
  ),
  ema: (
    <NavIcon>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </NavIcon>
  ),
  rsi: (
    <NavIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </NavIcon>
  ),
  macd: (
    <NavIcon>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </NavIcon>
  ),
  'pivots-intro': (
    <NavIcon>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </NavIcon>
  ),
  'pivot-levels': (
    <NavIcon>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </NavIcon>
  ),
  'price-zone': (
    <NavIcon>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </NavIcon>
  ),
  'binance-pivots': (
    <NavIcon>
      <line x1="4" y1="4" x2="20" y2="4" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </NavIcon>
  ),
  fibonacci: (
    <NavIcon>
      <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10" />
      <path d="M12 22c2.5-3 4-6.5 4-10S14.5 5 12 2" />
      <path d="M12 12h10" />
    </NavIcon>
  ),
  'ai-overview': (
    <NavIcon>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </NavIcon>
  ),
  confidence: (
    <NavIcon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </NavIcon>
  ),
  'market-phase': (
    <NavIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </NavIcon>
  ),
  'market-regime': (
    <NavIcon>
      <path d="M3 3v18h18M9 9l3 3 4-4 5 5" />
    </NavIcon>
  ),
  'trade-logic': (
    <NavIcon>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </NavIcon>
  ),
  'swing-points': (
    <NavIcon>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </NavIcon>
  ),
  anomalies: (
    <NavIcon>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </NavIcon>
  ),
  default: (
    <NavIcon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </NavIcon>
  ),
};

function SvgFromString({ svg }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={iconStyle}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function getIcon(id) {
  const key = resolveIconId(id);
  if (ICONS[key]) return ICONS[key];
  if (EDU_ICONS[key]) return <SvgFromString svg={EDU_ICONS[key]} />;
  return ICONS.default;
}

export default function EducationIcon({ id }) {
  return getIcon(id);
}
