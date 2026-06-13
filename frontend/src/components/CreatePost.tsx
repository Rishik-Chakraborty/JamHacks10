'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Profile } from '@/types/contract';
import { api } from '@/lib/api';
import { loadImage, resizeToJpeg, readAsDataUrl, extractFrames } from '@/lib/mediaCapture';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <span className="label">connect…</span> },
);

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const NONE = '__none__';

export function CreatePost() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [frames, setFrames] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [lineId, setLineId] = useState<string>(NONE);
  const [isFinal, setIsFinal] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The user's active lines (as the influencer) they can attach progress to.
  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile', wallet],
    queryFn: () => api.getProfile(wallet!, wallet ?? undefined),
    enabled: !!wallet,
  });
  const activeLines = (profile?.challenges ?? []).filter((c) => c.status === 'active');

  if (!wallet) {
    return (
      <Panel className="p-8 max-w-2xl">
        <p className="label">New Post</p>
        <h2 className="display text-3xl text-ink mt-2">Connect your wallet to post</h2>
        <p className="text-sm text-ink-2 mt-2">Your wallet is your account — post photos or videos to grow your profile.</p>
        <div className="mt-5"><WalletMultiButton /></div>
      </Panel>
    );
  }

  async function onSelect(file: File) {
    setError(null);
    setProcessing(true);
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) throw new Error('Video too large — keep clips under 25 MB.');
        const [dataUrl, extracted] = await Promise.all([readAsDataUrl(file), extractFrames(file)]);
        setKind('video'); setPreview(dataUrl); setImageData(dataUrl); setMimeType(file.type || 'video/mp4'); setFrames(extracted);
      } else {
        const img = await loadImage(file);
        const { dataUrl, mimeType: mt } = resizeToJpeg(img);
        setKind('image'); setPreview(dataUrl); setImageData(dataUrl); setMimeType(mt); setFrames([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process that file.');
    } finally {
      setProcessing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageData) { setError('Pick a photo or video.'); return; }
    const attached = lineId !== NONE;
    if (attached && isFinal && kind === 'video' && frames.length === 0) {
      setError('Could not extract frames from this video for the judge — try another clip.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createPhoto({
        authorWallet: wallet!,
        challengeId: attached ? lineId : undefined,
        capturedAt: new Date().toISOString(),
        imageData,
        mimeType,
        frames: kind === 'video' && frames.length > 0 ? frames : undefined,
        caption: caption.trim() === '' ? undefined : caption.trim(),
        isFinal: attached ? isFinal : undefined,
      });
      router.push('/feed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl">
      <Panel className="p-6">
        <p className="label">New Post</p>
        <h2 className="display text-3xl text-ink mt-1">Share a photo or video</h2>

        {/* Picker */}
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || processing}>
              {processing ? 'Processing…' : preview ? 'Replace' : 'Choose photo / video'}
            </Button>
            <span className="text-xs text-faint">JPEG / PNG or MP4 / MOV (≤ 25 MB)</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSelect(f); }}
          />
        </div>

        {preview && (
          <div className="border border-line bg-paper-2 p-2 mt-4">
            {kind === 'video' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={preview} controls playsInline className="block w-full max-h-96" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="preview" className="block w-full max-h-96 object-contain" />
            )}
          </div>
        )}

        {/* Caption */}
        <label className="block mt-4">
          <div className="flex items-baseline justify-between">
            <span className="label">Caption</span>
            <span className="num text-xs text-faint">{caption.length}/280</span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something…"
            rows={2}
            maxLength={280}
            disabled={busy}
            className="mt-1.5 w-full bg-card border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none resize-none"
          />
        </label>

        {/* Attach to a line */}
        <div className="mt-4">
          <span className="label">Attach to a line <span className="text-faint normal-case">(optional)</span></span>
          {activeLines.length === 0 ? (
            <p className="text-xs text-faint mt-1.5">You have no active lines to attach progress to.</p>
          ) : (
            <select
              value={lineId}
              onChange={(e) => { setLineId(e.target.value); if (e.target.value === NONE) setIsFinal(false); }}
              disabled={busy}
              className="w-full bg-paper border border-line focus:border-ink outline-none px-3 h-11 mt-1.5 text-ink"
            >
              <option value={NONE}>None — just a post</option>
              {activeLines.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
        </div>

        {lineId !== NONE && (
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer select-none">
            <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 accent-[#c2381b]" />
            <span className="text-sm text-ink-2 leading-snug">
              <span className="display-tight text-ink text-base">This is the final proof</span>
              <span className="block text-xs text-muted">Submitting locks in what the AI judges for this line.</span>
            </span>
          </label>
        )}

        {isFinal && <div className="mt-3"><Tag tone="accent">Final proof — triggers judging</Tag></div>}

        {error && (
          <div className="border border-no bg-no-soft px-3 py-2 mt-4">
            <span className="label text-no">{error}</span>
          </div>
        )}

        <div className="rule pt-4 mt-5">
          <Button type="submit" variant="accent" size="lg" disabled={busy || processing || !imageData}>
            {busy ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </Panel>
    </form>
  );
}
