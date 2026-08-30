/**
 * API route: /api/sync
 * Triggers a full sync from monday.com boards → cleaned Postgres tables.
 * Idempotent — safe to call repeatedly.
 */
import { NextResponse } from 'next/server';
import { initializeSchema } from '@/lib/db';
import { fullSync } from '@/lib/sync';

export const maxDuration = 60; // Allow up to 60s for sync

export async function POST() {
  try {
    // Initialize schema (creates tables if needed)
    await initializeSchema();

    // Run full sync pipeline
    const result = await fullSync();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to trigger a sync',
    lastSyncAvailable: 'Query sync_log table for last sync timestamp',
  });
}
