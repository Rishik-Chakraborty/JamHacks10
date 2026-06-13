import type { Metadata } from 'next';
import { CreatePost } from '@/components/CreatePost';

export const metadata: Metadata = {
  title: 'New Post — the gainsXchange',
  description: 'Post a photo or video to your profile, or attach progress to a line.',
};

export default function NewPostPage() {
  return (
    <div className="max-w-6xl mx-auto px-5">
      <section className="py-8 border-b border-ink">
        <p className="label">Create</p>
        <h1 className="display text-5xl sm:text-6xl text-ink mt-2">New post</h1>
      </section>
      <section className="py-7">
        <CreatePost />
      </section>
    </div>
  );
}
