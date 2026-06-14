'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Photo, ChallengeStatus } from '@/types/contract';
import { api } from '@/lib/api';
import { Tag } from '@/components/ui/Tag';
import { formatDate } from '@/lib/format';
import { mediaSrc, isVideo } from '@/lib/media';

interface Props {
  photos: Photo[];
  /** The owning line's id + status — drives whether a final proof can be deleted. */
  challengeId: string;
  status: ChallengeStatus;
}

/** A line is inactive (settled / refunded) once resolution can no longer touch its
 *  final proof — only then is deleting that proof safe (mirrors the backend guard). */
function isInactive(status: ChallengeStatus): boolean {
  return status === 'resolved' || status === 'refunded';
}

/** Newest-first grid of progress shots. Hard-edged thumbnails, hairline rules. */
export function PhotoGallery({ photos, challengeId, status }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const wallet = publicKey?.toBase58();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!photos || photos.length === 0) {
    return (
      <div className="border border-line bg-card p-8 text-center">
        <p className="display text-xl text-ink">No proof yet</p>
        <p className="text-sm text-muted mt-1.5">Progress shots will show up here as they&rsquo;re posted.</p>
      </div>
    );
  }

  const ordered = [...photos].sort(
    (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
  );

  async function onDelete(photo: Photo) {
    if (!wallet) return;
    if (!window.confirm('Delete this final verification photo? This cannot be undone.')) return;
    setDeletingId(photo.id);
    setError(null);
    try {
      await api.deletePhoto(photo.id, wallet);
      await queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that photo.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between rule-ink pt-2">
        <h3 className="display text-xl text-ink">Progress</h3>
        <span className="num text-sm text-muted">{ordered.length} shot{ordered.length === 1 ? '' : 's'}</span>
      </div>

      {error && <p className="text-xs text-no mt-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        {ordered.map((photo) => {
          // Final proof of an inactive line, deletable only by its author.
          const canDelete =
            photo.isFinal && isInactive(status) && !!wallet && photo.authorWallet === wallet;
          return (
            <figure key={photo.id} className="bg-card border border-line">
              <div className="relative bg-paper-2">
                {isVideo(photo) ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption */
                  <video
                    src={mediaSrc(photo)}
                    controls
                    playsInline
                    preload="metadata"
                    className="block w-full aspect-square object-cover bg-ink"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={mediaSrc(photo)}
                    alt={`Progress shot from ${formatDate(photo.capturedAt)}`}
                    className="block w-full aspect-square object-cover"
                  />
                )}
                <div className="absolute top-0 left-0 m-1.5 flex gap-1.5">
                  {photo.isFinal && (
                    <Tag tone="accent" solid>
                      Final proof
                    </Tag>
                  )}
                  {isVideo(photo) && <Tag tone="ink" solid>Video</Tag>}
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(photo)}
                    disabled={deletingId === photo.id}
                    className="absolute top-0 right-0 m-1.5 label bg-ink text-paper px-2 py-1 hover:bg-no disabled:opacity-50"
                  >
                    {deletingId === photo.id ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
              <figcaption className="rule px-2 py-2 flex items-baseline justify-between gap-2">
                <span className="label tracking-normal text-ink-2">{formatDate(photo.capturedAt)}</span>
                {photo.metricValue !== undefined && (
                  <span className="num text-sm text-ink">{photo.metricValue}</span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
