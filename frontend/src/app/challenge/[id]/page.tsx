/**
 * Challenge detail route — Server Component shell.
 *
 * Next.js 16: dynamic route params are a Promise and must be awaited.
 * All interactivity lives in the <ChallengeDetail/> client component.
 */
import { ChallengeDetail } from '@/components/ChallengeDetail';

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChallengeDetail id={id} />;
}
