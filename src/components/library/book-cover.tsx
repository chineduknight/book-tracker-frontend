'use client';

import { BookOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Only `https:` covers are shown: plain `http:` images are blocked on an https site anyway. */
function displayableCover(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * The book's cover from the address the reader saved, or the built-in placeholder when there is
 * none, it is not https, or it fails to load. The browser fetches the image directly from that
 * site (Avuneri never downloads or stores it), so the site learns the reader's IP address; it is
 * never told which Avuneri page asked (`no-referrer`), and images below the fold load only when
 * scrolled to. Decorative: the title is always next to it.
 */
export function BookCover({ className, src }: { className?: string; src?: string | undefined }) {
  const cover = displayableCover(src);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image that failed before the page became interactive fired its error event unheard.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [cover]);

  const frame = cn(
    'grid aspect-[2/3] w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-accent-soft text-accent-ink',
    className,
  );
  if (cover && !failed) {
    return (
      <span aria-hidden="true" className={frame}>
        {/* A plain <img>: Next.js image optimisation would fetch and re-serve the reader's
            external image through this server, with its cost and privacy trade-offs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={cover}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={frame}>
      <BookOpen className="size-5" />
    </span>
  );
}
