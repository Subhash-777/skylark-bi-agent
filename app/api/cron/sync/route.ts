/**
 * Vercel Cron route: /api/cron/sync
 * Scheduled re-sync (every 30 min via vercel.json config).
 * Protected by CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { initializeSchema } from '@/lib/db';
import { fullSync } from '@/lib/sync';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initializeSchema();
    const result = await fullSync();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Cron sync error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
