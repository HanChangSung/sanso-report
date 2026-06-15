import { type ElevationPoint, type LngLat } from '@/types/terrain';

/**
 * 표고(DEM) 공급원 설정.
 *
 * 기본값은 OpenTopoData(무료, SRTM 30m) — 한 번의 요청으로 여러 점을 조회한다.
 * VWorld 는 좌표→표고를 돌려주는 공식 포인트 REST API 가 없어 여기서 쓰지 않는다.
 * 향후 국토지리정보원/유료 DEM 으로 교체해도 호출부(분석 로직)는 그대로다 —
 * 환경변수 DEM_BASE_URL / DEM_DATASET 만 바꾸면 된다.
 */
const DEM_BASE = process.env.DEM_BASE_URL ?? 'https://api.opentopodata.org/v1';
const DEM_DATASET = process.env.DEM_DATASET ?? 'srtm30m';

interface OpenTopoResponse {
  results?: { elevation: number | null }[];
  status?: string;
  error?: string;
}

/**
 * 여러 좌표의 표고(m)를 한 번의 요청으로 조회.
 * 실패하거나 데이터가 없는 점은 elevation = null 로 채워 반환한다(순서 보존).
 */
export async function getElevations(points: LngLat[]): Promise<ElevationPoint[]> {
  if (points.length === 0) return [];

  // OpenTopoData locations 형식: "lat,lng|lat,lng|..."
  const locations = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `${DEM_BASE}/${DEM_DATASET}?locations=${locations}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`DEM 응답 ${res.status}`);

    const json = (await res.json()) as OpenTopoResponse;
    if (json.status && json.status !== 'OK') {
      throw new Error(json.error ?? `DEM status ${json.status}`);
    }

    const results = json.results ?? [];
    return points.map((p, i) => {
      const e = results[i]?.elevation;
      return { ...p, elevation: typeof e === 'number' ? e : null };
    });
  } catch (e) {
    console.warn('[elevation] DEM 조회 실패:', (e as Error).message);
    return points.map((p) => ({ ...p, elevation: null }));
  }
}

/** 단일 좌표 표고 조회 헬퍼 */
export async function getElevation(point: LngLat): Promise<number | null> {
  const [r] = await getElevations([point]);
  return r?.elevation ?? null;
}
