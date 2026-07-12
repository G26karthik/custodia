import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ReportsClient } from './reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (!['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'].includes(user.role)) redirect('/dashboard');

  return <ReportsClient />;
}
