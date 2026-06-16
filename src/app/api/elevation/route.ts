import { NextResponse, type NextRequest } from 'next/server';
import { getElevations } from '@/lib/elevation';
import { type LngLat } from '@/types/terrain';

/**
 * POST /api/elevation — 여러 좌표의 표고(m)를 한 번에 조회 (현장 패철 2점 측정용).
 * body: { points: [{lng,lat}, ...] }  →  { elevations: (number|null)[] }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { points } = (body ?? {}) as { points?: unknown };
  if (!Array.isArray(points) || points.length === 0) {
    return NextResponse.json({ error: 'points 배열이 필요합니다.' }, { status: 400 });
  }

  const clean: LngLat[] = [];
  for (const p of points) {
    const { lng, lat } = (p ?? {}) as Record<string, unknown>;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return NextResponse.json({ error: '각 점은 lng/lat 숫자가 필요합니다.' }, { status: 400 });
    }
    clean.push({ lng, lat });
  }

  const results = await getElevations(clean);
  return NextResponse.json({ elevations: results.map((r) => r.elevation) });
}
