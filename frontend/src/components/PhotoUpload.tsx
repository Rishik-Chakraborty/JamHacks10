/**
 * PhotoUpload — creator-only progress photo poster.
 *
 * Flow: pick a file → read as a base64 data URL → draw it to a <canvas> with a
 * burned-in timestamp overlay (BeReal-style proof) → export the composited
 * canvas back to a data URL → submit via api.createPhoto. Optional metric value
 * + an "isFinal" toggle (the photo the AI oracle judges at the deadline).
 *
 * Only the challenge creator's connected wallet sees the control.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { Camera, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import type { Challenge, Photo, CreatePhotoBody } from '@/types/contract';

export interface PhotoUploadProps {
  challenge: Challenge;
  className?: string;
}

/** Read a File into a base64 data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Load an HTMLImageElement from a data URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

/** Draw the source image to a canvas with a timestamp overlay; return JPEG data URL. */
async function compositeWithTimestamp(
  canvas: HTMLCanvasElement,
  dataUrl: string,
  capturedAt: Date,
): Promise<string> {
  const img = await loadImage(dataUrl);
  // Cap the longest edge so payloads stay reasonable.
  const MAX = 1280;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  const label = capturedAt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const fontSize = Math.max(16, Math.round(w * 0.035));
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textBaseline = 'bottom';
  const padding = Math.round(fontSize * 0.6);
  const textWidth = ctx.measureText(label).width;
  const boxH = fontSize + padding * 2;

  // Translucent backdrop strip bottom-left.
  ctx.fillStyle = 'rgba(7, 6, 13, 0.6)';
  ctx.fillRect(0, h - boxH, textWidth + padding * 2, boxH);
  // GymCast accent tag.
  ctx.fillStyle = '#c6ff3d';
  ctx.fillText(label, padding, h - padding);

  return canvas.toDataURL('image/jpeg', 0.85);
}

export function PhotoUpload({ challenge, className = '' }: PhotoUploadProps) {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [metricValue, setMetricValue] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreator =
    !!publicKey && publicKey.toBase58() === challenge.creatorWallet;

  const mutation = useMutation({
    mutationFn: (body: CreatePhotoBody) => api.createPhoto(body),
    onSuccess: (photo: Photo) => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      queryClient.invalidateQueries({ queryKey: ['photos', challenge.id] });
      // Reset form.
      setPreview(null);
      setMetricValue('');
      setIsFinal(false);
      setError(null);
      if (fileRef.current) fileRef.current.value = '';
      void photo;
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Failed to post photo'),
  });

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const raw = await readAsDataUrl(file);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not ready');
      const composited = await compositeWithTimestamp(canvas, raw, new Date());
      setPreview(composited);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process image');
    }
  }, []);

  const submit = useCallback(() => {
    if (!preview) {
      setError('Choose a photo first');
      return;
    }
    const parsedMetric = metricValue.trim() === '' ? undefined : Number(metricValue);
    if (parsedMetric !== undefined && !Number.isFinite(parsedMetric)) {
      setError('Metric value must be a number');
      return;
    }
    mutation.mutate({
      challengeId: challenge.id,
      capturedAt: new Date().toISOString(),
      imageData: preview,
      mimeType: 'image/jpeg',
      metricValue: parsedMetric,
      isFinal,
    });
  }, [preview, metricValue, isFinal, challenge.id, mutation]);

  // Hidden canvas always rendered so the ref exists for compositing.
  const hiddenCanvas = <canvas ref={canvasRef} className="hidden" />;

  if (!isCreator) {
    // Non-creators never see the control (canvas not needed either).
    return null;
  }

  return (
    <Card className={`flex flex-col gap-4 p-4 ${className}`}>
      {hiddenCanvas}
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold">Post a progress photo</h3>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void onFile(e.target.files?.[0])}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
      />

      {preview && (
        <div className="overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Photo preview with timestamp" className="w-full object-cover" />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Metric value (optional)
          <input
            type="number"
            inputMode="decimal"
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            placeholder="e.g. 185"
            className="h-9 w-32 rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground outline-none focus:border-brand"
          />
        </label>

        <label className="flex h-9 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isFinal}
            onChange={(e) => setIsFinal(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Mark as final photo
        </label>
      </div>

      {isFinal && (
        <p className="text-xs text-warn">
          The final photo is what the AI oracle judges at the deadline. Make it count.
        </p>
      )}
      {error && <p className="text-xs text-no">{error}</p>}

      <Button
        variant="accent"
        onClick={submit}
        disabled={!preview || mutation.isPending}
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Posting…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> Post photo
          </>
        )}
      </Button>
    </Card>
  );
}
