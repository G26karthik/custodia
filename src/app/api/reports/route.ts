import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getReports, getReportsCsv, ReportError } from '@/lib/services/reportService';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  try {
    if (format === 'csv') {
      const csv = await getReportsCsv(session);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="assetflow-reports.csv"',
        },
      });
    }

    return NextResponse.json(await getReports(session));
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Unable to load reports.' }, { status: 500 });
  }
}
