import { NextResponse, type NextRequest } from 'next/server';
import { readSites, writeSites } from '@/lib/sitesStore';
import { type Site } from '@/types/site';

// GET /api/sites — 저장된 묘역 전체 목록
export async function GET() {
  const sites = await readSites();
  return NextResponse.json(sites);
}

// POST /api/sites — 신규 묘역 좌표 저장
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { name, customer, memo, lng, lat } = (body ?? {}) as Record<string, unknown>;

  if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) {
    return NextResponse.json({ error: '좌표(lng/lat)가 필요합니다.' }, { status: 400 });
  }

  const sites = await readSites();
  const site: Site = {
    id: crypto.randomUUID(),
    name: String(name ?? '').trim() || '이름 없음',
    customer: String(customer ?? '').trim(),
    memo: String(memo ?? '').trim(),
    lng,
    lat,
    createdAt: new Date().toISOString(),
  };

  // 최신 항목이 위로 오도록 앞에 추가
  sites.unshift(site);
  await writeSites(sites);

  return NextResponse.json(site, { status: 201 });
}
