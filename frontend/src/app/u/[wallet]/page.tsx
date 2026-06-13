import { ProfileView } from '@/components/ProfileView';

export default async function ProfilePage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  return <ProfileView wallet={wallet} />;
}
