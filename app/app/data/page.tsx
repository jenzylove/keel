import { redirect } from 'next/navigation';

// The story lives on the landing page now; the raw numbers live in the repo.
export default function Page() {
  redirect('/');
}
