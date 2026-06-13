'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Upload, CheckCircle2, Loader2, Sparkles, User, Award, ShieldCheck } from 'lucide-react';

export default function ProfilePage() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [progress, setProgress] = useState(0);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show image preview
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setStatus('processing');
      setProgress(0);

      // Simulate AI processing progress
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 5;
        setProgress(currentProgress);
        if (currentProgress >= 100) {
          clearInterval(interval);
          setStatus('success');
        }
      }, 120); // ~2.4 seconds total processing time
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      {/* Profile Header */}
      <div className="bg-card border border-line p-6 mb-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="w-24 h-24 bg-paper-3 border-2 border-ink rounded-full flex items-center justify-center text-4xl shrink-0 overflow-hidden relative">
          {imageSrc ? (
            <Image src={imageSrc} alt="Profile Picture" fill className="object-cover" />
          ) : (
            '💪'
          )}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1.5">
            <h1 className="display text-3xl text-ink leading-none">Ryan</h1>
            <span className="label bg-accent text-paper px-2 py-0.5 text-xs font-mono tracking-wider self-center sm:self-auto">
              CREATOR
            </span>
          </div>
          <p className="text-sm text-muted font-mono mb-4">@ryan • 0x8f...7e34</p>
          
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 max-w-sm mx-auto sm:mx-0">
            <div>
              <div className="label text-[10px]">Active Lines</div>
              <div className="num text-lg text-ink">1</div>
            </div>
            <div>
              <div className="label text-[10px]">Total Bets</div>
              <div className="num text-lg text-ink">47</div>
            </div>
            <div>
              <div className="label text-[10px]">Staked SOL</div>
              <div className="num text-lg text-accent">59.2 SOL</div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Panel */}
      <div className="bg-card border border-line p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 text-muted">
          <ShieldCheck className="w-5 h-5 opacity-30" />
        </div>

        <h2 className="display text-xl text-ink mb-1.5 flex items-center gap-2">
          Submit Settlement Verification
        </h2>
        <p className="text-xs text-muted mb-5">
          Upload proof to settle the prediction market: <strong className="text-ink">"Will his abs be visible by the end of the year?"</strong>
        </p>

        {status === 'idle' && (
          <label className="border-2 border-dashed border-line hover:border-ink transition-colors bg-paper-2 h-44 flex flex-col items-center justify-center cursor-pointer p-4 group">
            <Upload className="w-8 h-8 text-muted group-hover:text-accent transition-colors mb-3" />
            <span className="font-display text-sm uppercase text-ink group-hover:text-accent transition-colors">
              Upload Verification Image
            </span>
            <span className="text-[10px] text-muted font-mono mt-1">
              Supports PNG, JPG (e.g. jacked.png)
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>
        )}

        {status === 'processing' && (
          <div className="bg-paper-2 border border-line p-6 flex flex-col items-center justify-center min-h-[176px]">
            <Loader2 className="w-8 h-8 text-accent animate-spin mb-3" />
            <div className="font-display text-sm uppercase text-ink flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-4 h-4 text-accent" />
              AI Oracle Analyzing Image...
            </div>
            <div className="w-full max-w-xs bg-line h-1.5 mt-3 overflow-hidden rounded-full border border-ink">
              <div
                className="bg-accent h-full transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-muted font-mono mt-1.5">{progress}% processed</span>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-success/5 border border-success/30 p-6 flex flex-col items-center justify-center text-center min-h-[176px]">
            <CheckCircle2 className="w-12 h-12 text-yes mb-3 animate-bounce" />
            <div className="font-display text-lg uppercase text-yes font-bold tracking-wide">
              Verdict: Abs Visible!
            </div>
            <p className="text-xs text-muted max-w-md mt-1">
              AI Vision Oracle confirmed abs are visible. The market <span className="font-semibold text-ink">"Will his abs be visible by the end of the year?"</span> has been settled on-chain as <strong className="text-yes">YES</strong>.
            </p>
            <button
              onClick={() => {
                setStatus('idle');
                setImageSrc(null);
              }}
              className="mt-4 px-4 h-8 bg-ink text-paper font-display uppercase text-xs hover:bg-accent transition-colors"
            >
              Reset Demo
            </button>
          </div>
        )}

        {/* Uploaded Preview */}
        {imageSrc && status !== 'success' && (
          <div className="mt-5 border border-line p-3 bg-paper-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-2 tracking-wider">
              Verification Proof Preview
            </div>
            <div className="relative aspect-video w-full max-w-sm mx-auto border border-ink bg-card">
              <Image src={imageSrc} alt="Proof Preview" fill className="object-contain" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
