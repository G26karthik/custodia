import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDashboard } from '@/lib/services/dashboardService';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await getDashboard(session));
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Unable to load dashboard.' }, { status: 500 });
  }
}
