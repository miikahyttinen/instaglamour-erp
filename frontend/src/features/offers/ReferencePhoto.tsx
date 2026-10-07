import { useState } from 'react';
import { referenceInitials } from './referenceInitials';
import './referencePhoto.css';

interface Props {
  /** Image URL, or null for the placeholder. */
  src: string | null;
  author: string;
  className?: string;
}

/**
 * Reference photo (BR-108) or a neutral placeholder with the author's initials. Never an external
 * image. A photo that fails to load (e.g. 404) falls back to the placeholder. Decorative: the
 * author is always written next to it, so the image has an empty alt.
 */
export function ReferencePhoto({ src, author, className }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src !== null && failed !== src;
  const classes = ['reference-photo', className].filter(Boolean).join(' ');
  if (showImage) {
    return (
      <div className={classes}>
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      </div>
    );
  }
  return (
    <div className={`${classes} reference-photo-placeholder`} aria-hidden="true" data-testid="reference-placeholder">
      <span>{referenceInitials(author)}</span>
    </div>
  );
}
