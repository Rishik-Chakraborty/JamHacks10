'use client';

import { useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Challenge, ChallengeDetail } from '@/types/contract';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

interface Props {
  challenge: Challenge | ChallengeDetail;
}

const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.85;
const FRAME_MAX_SIDE = 768;
const FRAME_COUNT = 5;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB cap on uploaded clips

type Kind = 'image' | 'video';

/** Read a File into an HTMLImageElement via an object URL. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/**
 * Draw the image to a hidden canvas (capped to MAX_SIDE on the longest edge),
 * burn a timestamp caption into the lower-left corner, and re-export as a JPEG
 * data URL. Editorial caption: uppercase, hairline backing band.
 */
function processImage(img: HTMLImageElement, when: Date): { dataUrl: string; mimeType: string } {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');

  ctx.drawImage(img, 0, 0, w, h);

  const caption = `${when
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()}  //  ${when.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const fontSize = Math.max(14, Math.round(w * 0.028));
  const pad = Math.round(fontSize * 0.6);
  ctx.font = `600 ${fontSize}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
  ctx.textBaseline = 'alphabetic';
  const textW = ctx.measureText(caption).width;
  const bandH = fontSize + pad * 2;

  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, h - bandH, textW + pad * 2, bandH);
  ctx.fillStyle = '#c2381b';
  ctx.fillRect(0, h - bandH, textW + pad * 2, Math.max(2, Math.round(fontSize * 0.12)));
  ctx.fillStyle = '#f4f1e8';
  ctx.fillText(caption, pad, h - pad);

  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mimeType: 'image/jpeg' };
}

/** Read a File as a base64 data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** Seek a video element to a timestamp and resolve once the frame is ready. */
function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(new Error('Could not read a video frame.'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = t;
  });
}

/**
 * Extract FRAME_COUNT evenly-spaced still frames from a video as JPEG data URLs.
 * These are what the AI oracle judges, since it can't watch raw video.
 */
async function extractFrames(file: File): Promise<string[]> {
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
      // Spread across the clip, biased away from the very first/last instant.
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

export function PhotoUpload({ challenge }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>('image');
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [frames, setFrames] = useState<string[]>([]);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [metricValue, setMetricValue] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [isFinal, setIsFinal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unit = 'metricUnit' in challenge ? challenge.metricUnit : undefined;

  // Only the creator posts progress proof.
  if (!publicKey || publicKey.toBase58() !== challenge.creatorWallet) return null;

  async function onSelect(file: File) {
    setStatus('idle');
    setErrorMsg(null);
    setProcessing(true);
    try {
      const now = new Date();
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error('Video is too large — keep clips under 25 MB (a few seconds is plenty).');
        }
        const [dataUrl, extracted] = await Promise.all([readAsDataUrl(file), extractFrames(file)]);
        setKind('video');
        setPreview(dataUrl);
        setImageData(dataUrl);
        setMimeType(file.type || 'video/mp4');
        setFrames(extracted);
        setCapturedAt(now.toISOString());
      } else {
        const img = await loadImage(file);
        const { dataUrl, mimeType: mt } = processImage(img, now);
        setKind('image');
        setPreview(dataUrl);
        setImageData(dataUrl);
        setMimeType(mt);
        setFrames([]);
        setCapturedAt(now.toISOString());
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not process that file.');
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setKind('image');
    setPreview(null);
    setImageData(null);
    setFrames([]);
    setCapturedAt(null);
    setMetricValue('');
    setCaption('');
    setIsFinal(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageData || !capturedAt) return;
    if (kind === 'video' && isFinal && frames.length === 0) {
      setStatus('error');
      setErrorMsg('Could not extract frames from this video for the AI judge — try another clip.');
      return;
    }
    setBusy(true);
    setStatus('idle');
    setErrorMsg(null);
    try {
      const trimmed = metricValue.trim();
      const parsedMetric = trimmed === '' ? undefined : Number(trimmed);
      const trimmedCaption = caption.trim();
      await api.createPhoto({
        challengeId: challenge.id,
        capturedAt,
        imageData,
        mimeType,
        frames: kind === 'video' && frames.length > 0 ? frames : undefined,
        metricValue: parsedMetric !== undefined && Number.isFinite(parsedMetric) ? parsedMetric : undefined,
        caption: trimmedCaption === '' ? undefined : trimmedCaption,
        isFinal,
      });
      await queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      setStatus('success');
      reset();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl text-ink">Post Proof</h3>
        <Tag tone="muted">Creator only</Tag>
      </div>
      <p className="text-sm text-ink-2 mt-1.5">
        Drop a progress photo or a short video. Photos get a burned-in timestamp; videos are judged
        from extracted frames at the deadline.
      </p>

      <form onSubmit={onSubmit} className="rule mt-4 pt-4 flex flex-col gap-4">
        {/* File picker */}
        <div>
          <span className="label">Photo or video</span>
          <div className="mt-1.5 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy || processing}
            >
              {processing ? 'Processing…' : preview ? 'Replace' : 'Choose file'}
            </Button>
            {preview ? (
              <button
                type="button"
                onClick={reset}
                disabled={busy || processing}
                className="label tracking-normal underline hover:text-accent disabled:opacity-40"
              >
                Clear
              </button>
            ) : (
              <span className="text-xs text-faint">JPEG / PNG or MP4 / MOV (≤ 25 MB)</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onSelect(f);
            }}
          />
        </div>

        {/* Preview */}
        {preview && (
          <div className="border border-line bg-paper-2 p-2">
            {kind === 'video' ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={preview} controls playsInline className="block w-full max-h-80" />
                <p className="label tracking-normal text-faint mt-2">
                  {frames.length} frame{frames.length === 1 ? '' : 's'} extracted for the AI judge
                </p>
              </>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="Proof preview" className="block w-full max-h-80 object-contain" />
            )}
          </div>
        )}

        {/* Metric + final flag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="label">Metric value{unit ? ` (${unit})` : ''}</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={metricValue}
              onChange={(e) => setMetricValue(e.target.value)}
              placeholder="optional"
              disabled={busy}
              className="num mt-1.5 w-full h-10 px-3 bg-card border border-line text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex items-start gap-2.5 sm:items-center sm:pt-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFinal}
              onChange={(e) => setIsFinal(e.target.checked)}
              disabled={busy}
              className="mt-0.5 sm:mt-0 h-4 w-4 accent-[#c2381b]"
            />
            <span className="text-sm text-ink-2 leading-snug">
              <span className="display-tight text-ink text-base">Mark as final proof</span>
              <span className="block text-xs text-muted">This is what the AI judges.</span>
            </span>
          </label>
        </div>

        {/* Caption */}
        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="label">Caption</span>
            <span className="num text-xs text-faint">{caption.length}/280</span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="optional — what's the story on this shot?"
            rows={2}
            maxLength={280}
            disabled={busy}
            className="mt-1.5 w-full bg-card border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none resize-none"
          />
        </label>

        {isFinal && (
          <div className="border border-accent bg-card px-3 py-2">
            <span className="label text-accent">Final proof</span>
            <p className="text-xs text-ink-2 mt-0.5">
              Submitting this locks in the {kind === 'video' ? 'video' : 'photo'} the oracle evaluates at the deadline.
            </p>
          </div>
        )}

        {/* Status */}
        {status === 'success' && (
          <div className="border border-yes bg-yes-soft px-3 py-2">
            <span className="label text-yes">Posted</span>
            <p className="text-xs text-ink-2 mt-0.5">Your proof is on the board.</p>
          </div>
        )}
        {status === 'error' && (
          <div className="border border-no bg-no-soft px-3 py-2">
            <span className="label text-no">Failed</span>
            <p className="text-xs text-ink-2 mt-0.5">{errorMsg ?? 'Something went wrong.'}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" size="md" disabled={busy || processing || !imageData}>
            {busy ? 'Posting…' : isFinal ? 'Submit final proof' : 'Post proof'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
