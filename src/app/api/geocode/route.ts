import { NextResponse, type NextRequest } from 'next/server';

// 지도 타일과 동일한 VWorld 키 사용 (서버 전용)
const VWORLD_KEY =
  process.env.VWORLD_KEY ?? process.env.NEXT_PUBLIC_VWORLD_KEY ?? '';
const REFERER = process.env.VWORLD_REFERER ?? 'http://localhost:3000/';
const GEOCODE_BASE = 'https://api.vworld.kr/req/address';

interface VWorldGeocodeResponse {
  response?: {
    status?: string;
    result?: { point?: { x?: string; y?: string } };
  };
}

/** VWorld Geocoder 호출 (type: ROAD 또는 PARCEL) */
async function geocode(address: string, type: 'ROAD' | 'PARCEL') {
  const params = new URLSearchParams({
    service: 'address',
    request: 'GetCoord',
    version: '2.0',
    crs: 'EPSG:4326',
    format: 'json',
    type,
    address,
    key: VWORLD_KEY,
  });
  const res = await fetch(`${GEOCODE_BASE}?${params}`, {
    headers: { Referer: REFERER },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`VWorld ${res.status}`);
  const json = (await res.json()) as VWorldGeocodeResponse;
  const r = json.response;
  if (r?.status !== 'OK' || !r.result?.point) return null;
  const lng = Number(r.result.point.x);
  const lat = Number(r.result.point.y);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return { lng, lat };
}

/**
 * GET /api/geocode?q=주소 — 주소를 좌표로 변환.
 * 도로명(ROAD) 먼저 시도하고 실패하면 지번(PARCEL)으로 재시도.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: '주소(q)가 필요합니다.' }, { status: 400 });
  }
  if (!VWORLD_KEY) {
    return NextResponse.json(
      { error: 'VWORLD_KEY 가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  try {
    const hit = (await geocode(q, 'ROAD')) ?? (await geocode(q, 'PARCEL'));
    if (!hit) {
      return NextResponse.json(
        { error: '주소를 찾지 못했습니다. 도로명/지번 주소를 확인해 주세요.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ...hit, label: q });
  } catch (e) {
    console.error('[geocode] 실패:', (e as Error).message);
    return NextResponse.json({ error: '주소 변환 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
