import type { ReactNode } from 'react';

type BannerProps = {
  kind: 'info' | 'warning';
  label: string;
  children: ReactNode;
};

export function Banner({ kind, label, children }: BannerProps) {
  return (
    <div className={`banner banner-${kind}`} role="note">
      <strong className="banner-label">{label}</strong>
      <span className="banner-text">{children}</span>
    </div>
  );
}
