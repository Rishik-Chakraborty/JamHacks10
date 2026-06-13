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

  // Timestamp caption, burned into the corner.
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

  // Ink band (no rounding) + paper text — matches the print idiom.
  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, h - bandH, textW + pad * 2, bandH);
  // Oxblood rule along the top of the band.
  ctx.fillStyle = '#c2381b';
  ctx.fillRect(0, h - bandH, textW + pad * 2, Math.max(2, Math.round(fontSize * 0.12)));
  ctx.fillStyle = '#f4f1e8';
  ctx.fillText(caption, pad, h - pad);

  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mimeType: 'image/jpeg' };
}

export function PhotoUpload({ challenge }: Props) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [metricValue, setMetricValue] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [isFinal, setIsFinal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Only the creator posts progress proof.
  if (!publicKey || publicKey.toBase58() !== challenge.creatorWallet) return null;

  async function onSelect(file: File) {
    setStatus('idle');
    setErrorMsg(null);
    try {
      const now = new Date();
      const img = await loadImage(file);
      const { dataUrl, mimeType: mt } = processImage(img, now);
      setPreview(dataUrl);
      setImageData(dataUrl);
      setMimeType(mt);
      setCapturedAt(now.toISOString());
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not process that image.');
    }
  }

  function reset() {
    setPreview(null);
    setImageData(null);
    setCapturedAt(null);
    setMetricValue('');
    setCaption('');
    setIsFinal(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageData || !capturedAt) return;
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
        Drop a progress shot. A timestamp is burned into the corner so the board can&rsquo;t be gamed.
      </p>

      <form onSubmit={onSubmit} className="rule mt-4 pt-4 flex flex-col gap-4">
        {/* File picker */}
        <div>
          <span className="label">Image</span>
          <div className="mt-1.5 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {preview ? 'Replace' : 'Choose file'}
            </Button>
            {preview ? (
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="label tracking-normal underline hover:text-accent disabled:opacity-40"
              >
                Clear
              </button>
            ) : (
              <span className="text-xs text-faint">JPEG / PNG, capped to 1280px</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onSelect(f);
            }}
          />
        </div>

        {/* Preview (data URL with burned-in timestamp) */}
        {preview && (
          <div className="border border-line bg-paper-2 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Proof preview" className="block w-full max-h-80 object-contain" />
          </div>
        )}

        {/* Metric + final flag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="label">Metric value</span>
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
            <p className="text-xs text-ink-2 mt-0.5">Submitting this locks in the photo the oracle evaluates at the deadline.</p>
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
          <Button type="submit" variant="accent" size="md" disabled={busy || !imageData}>
            {busy ? 'Posting…' : isFinal ? 'Submit final proof' : 'Post proof'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
