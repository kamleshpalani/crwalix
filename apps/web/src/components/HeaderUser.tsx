'use client';

import dynamic from 'next/dynamic';

const UserButton = dynamic(
  () => import('@clerk/nextjs').then((m) => m.UserButton),
  { ssr: false, loading: () => null }
);

export default function HeaderUser() {
  return <UserButton />;
}
