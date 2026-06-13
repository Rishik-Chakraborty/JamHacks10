import { ChallengeDetail } from '@/components/ChallengeDetail';

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeDetail id={id} />;
}
