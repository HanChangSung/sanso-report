import { type Direction8, type LngLat } from '@/types/terrain';

/** 8방위 순서 (북에서 시계방향) */
export const DIRECTIONS_8: Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** 8방위의 방위각(도, 북=0, 시계방향) */
export const DIRECTION_BEARINGS: Record<Direction8, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/** 8방위 한글 라벨 */
export const KOR_DIR: Record<Direction8, string> = {
  N: '북',
  NE: '북동',
  E: '동',
  SE: '남동',
  S: '남',
  SW: '남서',
  W: '서',
  NW: '북서',
};

// WGS84 지구 반경 (m)
const EARTH_R = 6_378_137;

/**
 * origin 에서 bearing(도, 북=0 시계방향) 방향으로 distM(m) 떨어진 좌표.
 * 수백 m 이내 근거리이므로 등거방형(equirectangular) 근사로 충분.
 */
export function destination(origin: LngLat, bearingDeg: number, distM: number): LngLat {
  const br = (bearingDeg * Math.PI) / 180;
  const dN = distM * Math.cos(br); // 북쪽 성분 (m)
  const dE = distM * Math.sin(br); // 동쪽 성분 (m)
  const dLat = (dN / EARTH_R) * (180 / Math.PI);
  const dLng =
    (dE / (EARTH_R * Math.cos((origin.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lng: origin.lng + dLng, lat: origin.lat + dLat };
}

/** 중심 주변 8방위의 좌표를 반경 radiusM 으로 생성 */
export function ringPoints(center: LngLat, radiusM: number): Record<Direction8, LngLat> {
  const out = {} as Record<Direction8, LngLat>;
  for (const d of DIRECTIONS_8) {
    out[d] = destination(center, DIRECTION_BEARINGS[d], radiusM);
  }
  return out;
}

/** 방위각(도)을 가장 가까운 8방위로 환산 */
export function bearingTo8(deg: number): Direction8 {
  const norm = (((deg % 360) + 360) % 360);
  const idx = Math.round(norm / 45) % 8;
  return DIRECTIONS_8[idx];
}
