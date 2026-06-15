import { NextResponse, type NextRequest } from 'next/server';
import { DIRECTIONS_8, ringPoints } from '@/lib/geo';
import { getElevations } from '@/lib/elevation';
import { analyzeTerrain } from '@/lib/terrainAnalysis';
import {
  type Direction8,
  type ElevationPoint,
  type TerrainSamples,
} from '@/types/terrain';

// 기본 샘플 반경 (m) — 묘 자리 규모의 장풍/경사를 보기 적당한 값
const DEFAULT_RADIUS_M = 80;

/**
 * POST /api/terrain — 클릭 좌표의 지형 분석 (경사·사면방위·장풍).
 * body: { lng, lat, radiusM? }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { lng, lat, radiusM } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof lng !== 'number' ||
    typeof lat !== 'number' ||
    Number.isNaN(lng) ||
    Number.isNaN(lat)
  ) {
    return NextResponse.json({ error: '좌표(lng/lat)가 필요합니다.' }, { status: 400 });
  }
  const radius =
    typeof radiusM === 'number' && radiusM > 0 ? radiusM : DEFAULT_RADIUS_M;

  const center = { lng, lat };
  const ring = ringPoints(center, radius);

  // 중심 + 8방위 = 9점을 한 번의 요청으로 표고 조회
  const points = [center, ...DIRECTIONS_8.map((d) => ring[d])];
  const elevs = await getElevations(points);

  const centerEl = elevs[0];
  if (centerEl.elevation == null) {
    return NextResponse.json(
      { error: '해당 좌표의 표고 데이터를 가져오지 못했습니다.' },
      { status: 502 },
    );
  }

  const ringEl = {} as Record<Direction8, ElevationPoint>;
  DIRECTIONS_8.forEach((d, i) => {
    ringEl[d] = elevs[i + 1];
  });

  const samples: TerrainSamples = { center: centerEl, ring: ringEl, radiusM: radius };
  const analysis = analyzeTerrain(samples);

  return NextResponse.json(analysis);
}
