/**
 * Media helpers shared by the gallery / feed / profile renderers.
 * Photos and videos are both stored as `Photo` docs and served from the same
 * endpoint; `mimeType` decides whether to render an <img> or a <video>.
 */
import type { Photo } from '@/types/contract';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

/** True when this proof is a video rather than a still image. */
export function isVideo(photo: Pick<Photo, 'mimeType'>): boolean {
  return photo.mimeType.startsWith('video/');
}

/** Resolve a proof's source: inline data URL, else the streaming endpoint. */
export function mediaSrc(photo: Pick<Photo, 'id' | 'imageData'>): string {
  if (photo.imageData) return photo.imageData;
  return `${API}/photos/${photo.id}/image`;
}
