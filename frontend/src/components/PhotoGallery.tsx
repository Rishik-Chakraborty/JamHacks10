/**
 * PhotoGallery — newest-first grid of challenge progress photos. Resolves each
 * photo's source from either the inline base64 `imageData` data URL or, for
 * GridFS-backed photos, the `/photos/:id/image` endpoint. Marks the final photo.
 */
'use client';

import { useMemo } from 'react';
import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Photo } from '@/types/contract';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

function photoSrc(p: Photo): string | null {
  if (p.imageData) return p.imageData;
  if (p.gridFsId) return `${API_BASE}/photos/${p.id}/image`;
  return null;
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export interface PhotoGalleryProps {
  photos: Photo[];
  className?: string;
}

export function PhotoGallery({ photos, className = '' }: PhotoGalleryProps) {
  const ordered = useMemo(
    () =>
      [...photos].sort(
        (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      ),
    [photos],
  );

  if (ordered.length === 0) {
    return (
      <div
        className={`flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted ${className}`}
      >
        No photos posted yet.
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${className}`}>
      {ordered.map((p) => {
        const src = photoSrc(p);
        return (
          <figure
            key={p.id}
            className="group relative overflow-hidden rounded-xl border border-border bg-surface-2"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`Progress photo from ${fmt(p.capturedAt)}`}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-xs text-muted">
                image unavailable
              </div>
            )}

            {p.isFinal && (
              <div className="absolute left-2 top-2">
                <Badge tone="accent" className="gap-1">
                  <Crown className="h-3.5 w-3.5" />
                  Final
                </Badge>
              </div>
            )}

            <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-foreground">
              <span>{fmt(p.capturedAt)}</span>
              {typeof p.metricValue === 'number' && (
                <span className="font-semibold tabular-nums text-accent">
                  {p.metricValue}
                </span>
              )}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
