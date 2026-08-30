/**
 * API route: /api/digest
 * Returns the Leadership Digest data.
 */
import { NextResponse } from 'next/server';
import { buildDigest } from '@/lib/tools';

export async function GET() {
  try {
    const digest = await buildDigest();
    return NextResponse.json(digest);
  } catch (err) {
    console.error('Digest error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
