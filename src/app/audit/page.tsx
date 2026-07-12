import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditClient } from './audit-client';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') redirect('/login');

  return <AuditClient user={user} />;
}
