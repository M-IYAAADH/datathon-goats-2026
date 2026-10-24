import type { ReactNode } from 'react';
import './Banner.css';

type BannerProps = {
  kind: 'info' | 'warning';
  label: string;
  children: ReactNode;
};

function BannerIcon({ kind }: { kind: BannerProps['kind'] }) {
  return (
    <svg
      className="banner-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d={kind === 'info' ? 'M12 11v6M12 7.5v.01' : 'M12 7v6M12 16.5v.01'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Banner({ kind, label, children }: BannerProps) {
  return (
    <div className={`banner banner-${kind}`} role="note">
      <BannerIcon kind={kind} />
      <p className="banner-body">
        <strong className="banner-label">{label}</strong>{' '}
        <span className="banner-text">{children}</span>
      </p>
    </div>
  );
}
