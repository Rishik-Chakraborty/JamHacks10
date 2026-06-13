/**
 * Browser media-capture helpers for the post composer: downscale photos, read
 * files as data URLs, and extract still frames from a video (what the AI judges).
 */

const MAX_SIDE = 1280;
const FRAME_MAX_SIDE = 768;
export const FRAME_COUNT = 5;

/** Read a File into an HTMLImageElement via an object URL. */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/** Downscale an image to a JPEG data URL (longest edge ≤ MAX_SIDE). */
export function resizeToJpeg(img: HTMLImageElement, quality = 0.85): { dataUrl: string; mimeType: string } {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' };
}

/** Read a File as a base64 data URL. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('Could not read a video frame.')); };
    const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onErr); };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = t;
  });
}

/** Extract FRAME_COUNT evenly-spaced JPEG frames from a video (for the AI oracle). */
export async function extractFrames(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not read that video.'));
    });
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) duration = 0;
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((video.videoWidth || FRAME_MAX_SIDE) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || FRAME_MAX_SIDE) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    const frames: string[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const t = duration > 0 ? Math.min(duration - 0.05, duration * ((i + 0.5) / FRAME_COUNT)) : 0;
      await seek(video, Math.max(0, t));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
