import { Stat } from '@/components/ui/Stat';

interface Props {
  hypeScore: number;
  streak: number;
  misses: number;
}

/**
 * Flat 0..100 momentum meter. Ink fill on a recessed track; switches to oxblood
 * accent at the top of the range. No glow, no gradient.
 */
export function HypeMeter({ hypeScore, streak, misses }: Props) {
  const score = Math.min(100, Math.max(0, Math.round(hypeScore)));
  const hot = score >= 80;

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="label text-ink">Hype Meter</h3>
        <span className="num text-2xl text-ink leading-none">
          {score}
          <span className="text-faint text-sm"> / 100</span>
        </span>
      </div>
      <div className="rule-ink mt-1.5" />

      <div className="mt-3 h-3 w-full bg-paper-2 border border-ink">
        <div
          className={`h-full ${hot ? 'bg-accent' : 'bg-ink'}`}
          style={{ width: `${score}%` }}
          aria-label={`hype ${score} of 100`}
        />
      </div>

      <div className="grid grid-cols-2 gap-px bg-line border border-line mt-3">
        <Stat className="bg-card p-3" label="Streak" value={`${streak}d`} tone="yes" />
        <Stat className="bg-card p-3" label="Misses" value={misses} tone={misses > 0 ? 'no' : 'ink'} />
      </div>
    </section>
  );
}
