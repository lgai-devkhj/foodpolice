import type { SVGProps } from 'react';

export type UiIconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  size?: number;
};

const sw = 1.65;

export function IconLeaf({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 20V9.5M12 9.5c0-4.5 3.5-8 8-8-1.5 5-4 8-8 8Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.5C12 5 8.5 1.5 4 1.5c1.5 4.5 4 8 8 8Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
    </svg>
  );
}

export function IconSearch({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={sw} />
      <path d="M16 16l5 5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IconHeart({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 19.5S5 14.25 5 9.25c0-2.75 2.25-5 5-5 1.5 0 2.9.7 3.7 1.8.8-1.1 2.2-1.8 3.7-1.8 2.75 0 5 2.25 5 5 0 5-7 10.25-7 10.25Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCamera({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 9.5a2 2 0 0 1 2-2h1.2L8.2 6h7.6l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth={sw} />
    </svg>
  );
}

export function IconImage({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth={sw} />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path d="M5 17l4.5-4.5 3 3L17 11l2 2.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.5 20.5 18H3.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M12 9.5v4.5M12 16.2v.1" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function IconSpinner({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg
      {...p}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`ui-spinner-svg ${className || ''}`.trim()}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28 48"
        fill="none"
      />
    </svg>
  );
}

export function IconSettings({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.6 5.6 4.1 4.1M19.9 19.9l-1.5-1.5M18.4 5.6l1.5-1.5M4.1 19.9l1.5-1.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconUser({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="8.5" r="3.25" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M6 19.5c0-3.25 2.7-5.75 6-5.75s6 2.5 6 5.75"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCheck({ size = 24, className, strokeWidth = 2.2, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 12.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTrash({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M9 5.5h6l1 2h4v1.5H4V7.5h4l1-2Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M8 10.5v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8M10 14v4M14 14v4" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IconSun({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconClipboard({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M9 4.5h6l1 2h3v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5h3l1-2Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M9 11.5h6M9 15.5h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function IconChart({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 19.5V5M4 19.5h16" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <path d="M8 16v-4M12 16V8M16 16v-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function IconFlask({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M10 3.5h4v5.2l4.5 9.3a2 2 0 0 1-1.8 2.8H7.3a2 2 0 0 1-1.8-2.8L10 8.7V3.5Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M9 14.5h6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

export function IconDroplet({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 21a6 6 0 0 0 6-6.5c0-3.5-6-10-6-10S6 11 6 14.5A6 6 0 0 0 12 21Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPalette({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.5a7.5 7.5 0 1 0 7.2 9.5c-.4 1.5-2 2.5-3.7 2.5H14a2 2 0 0 0 0 4h1"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="9" r="1" fill="currentColor" />
      <circle cx="10.5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="14" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconLock({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth={sw} />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 맞춤 안내 등 — 동심원 파동 느낌 */
export function IconTargetRipple({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.25} opacity={0.22} />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth={1.35} opacity={0.38} />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function IconUtensil({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M8 3v7a2 2 0 0 0 2 2v10M8 3c0 2-2 3.5-2 6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <path d="M16 3v18M16 3c0-1 2-2 2-4v11" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IconPencil({ size = 24, className, ...p }: UiIconProps) {
  return (
    <svg {...p} width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 20h8M4 13.5 14.5 3.5l5 5L9 19.5H4v-6Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </svg>
  );
}
