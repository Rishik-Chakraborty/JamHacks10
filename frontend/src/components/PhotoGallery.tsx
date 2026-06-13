import type { Photo } from '@/types/contract';
import { Tag } from '@/components/ui/Tag';
import { formatDate } from '@/lib/format';

interface Props {
  photos: Photo[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** Resolve a photo's image source: inline data URL, else the GridFS endpoint. */
function photoSrc(photo: Photo): string {
  if (photo.imageData) return photo.imageData;
  return `${API}/photos/${photo.id}/image`;
}

/** Newest-first grid of progress shots. Hard-edged thumbnails, hairline rules. */
export function PhotoGallery({ photos }: Props) {
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

  return (
    <div>
      <div className="flex items-baseline justify-between rule-ink pt-2">
        <h3 className="display text-xl text-ink">Progress</h3>
        <span className="num text-sm text-muted">{ordered.length} shot{ordered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        {ordered.map((photo) => (
          <figure key={photo.id} className="bg-card border border-line">
            <div className="relative bg-paper-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc(photo)}
                alt={`Progress shot from ${formatDate(photo.capturedAt)}`}
                className="block w-full aspect-square object-cover"
              />
              {photo.isFinal && (
                <div className="absolute top-0 left-0 m-1.5">
                  <Tag tone="accent" solid>
                    Final proof
                  </Tag>
                </div>
              )}
            </div>
            <figcaption className="rule px-2 py-2 flex items-baseline justify-between gap-2">
              <span className="label tracking-normal text-ink-2">{formatDate(photo.capturedAt)}</span>
              {photo.metricValue !== undefined && (
                <span className="num text-sm text-ink">{photo.metricValue}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
