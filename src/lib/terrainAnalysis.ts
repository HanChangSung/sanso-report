import {
  type Direction8,
  type TerrainAnalysis,
  type TerrainSamples,
} from '@/types/terrain';
import { DIRECTIONS_8, KOR_DIR, bearingTo8 } from './geo';
import { compassReading } from './luopan';
import { computeBibo } from './bibo';

/** 현장 2점 실측으로 DEM 산출값을 덮어쓰는 옵션 */
export interface MeasuredOverride {
  /** 실측 향 방위각 (0~360) */
  hyangDeg?: number;
  /** 실측/지정 파구 방위각 */
  paguDeg?: number;
  /** 실측 축 경사(도) */
  axisSlopeDeg?: number | null;
  /** 실측 배산임수(상단이 하단보다 높음) */
  baesanImsu?: boolean | null;
}

/** 각 방위의 반대 방위 */
const OPPOSITE: Record<Direction8, Direction8> = {
  N: 'S',
  NE: 'SW',
  E: 'W',
  SE: 'NW',
  S: 'N',
  SW: 'NE',
  W: 'E',
  NW: 'SE',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** DIRECTIONS_8 상에서 d 로부터 off 칸 떨어진 방위 (시계/반시계) */
function neighbor(d: Direction8, off: number): Direction8 {
  const i = DIRECTIONS_8.indexOf(d);
  return DIRECTIONS_8[(i + off + 8) % 8];
}

/**
 * 표고 샘플(중심 + 8방위)로부터 경사·사면방위·장풍(배산임수)을 계산한다.
 * GPT 없이 순수 숫자만 산출. ring 의 표고가 비면 중심 표고로 대체해 계산한다.
 */
export function analyzeTerrain(
  samples: TerrainSamples,
  override?: MeasuredOverride,
): TerrainAnalysis {
  const { center, ring, radiusM } = samples;
  const c = center.elevation ?? 0;

  // 방위별 표고 (없으면 중심값으로 대체 → 그 방향은 "평탄"으로 취급)
  const z = (d: Direction8): number => ring[d].elevation ?? c;

  // 방위별 중심 대비 상대고도 (+면 주변이 더 높음). 데이터 없으면 null 유지.
  const relief = {} as Record<Direction8, number | null>;
  for (const d of DIRECTIONS_8) {
    const e = ring[d].elevation;
    relief[d] = e == null || center.elevation == null ? null : round(e - c);
  }

  // --- Horn 공식: 중심+8방위를 3x3 격자로 보고 경사/사면방위 산출 (셀 간격 = radiusM) ---
  // dzdx = ∂z/∂동(+동쪽이 높으면 +), dzdy = ∂z/∂북(+북쪽이 높으면 +)
  const dzdx =
    (z('NE') + 2 * z('E') + z('SE') - (z('NW') + 2 * z('W') + z('SW'))) / (8 * radiusM);
  const dzdy =
    (z('NW') + 2 * z('N') + z('NE') - (z('SW') + 2 * z('S') + z('SE'))) / (8 * radiusM);

  const slopeDeg = round((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI);

  // 향(앞쪽) = 내리막 방향 = -gradient. (E,N) 성분을 방위각(북=0, 시계방향)으로 변환.
  const aspectRaw = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
  const aspectDeg = round(((aspectRaw % 360) + 360) % 360, 1);
  const aspect8 = bearingTo8(aspectDeg);
  const back8 = OPPOSITE[aspect8];

  // --- 장풍(藏風): 뒤·옆이 감싸 오르고(배산), 앞이 트여 내려가는(임수) 정도 ---
  const rv = (d: Direction8): number => relief[d] ?? 0;
  // 배산: 뒤쪽 3방위(좌/좌측면)의 상대고도 평균 (+가 좋음)
  const backRise =
    (rv(back8) + rv(neighbor(back8, -1)) + rv(neighbor(back8, 1))) / 3;
  // 임수: 앞쪽 3방위가 낮을수록 좋음 → 음의 상대고도를 + 로 환산
  const frontDrop =
    -(rv(aspect8) + rv(neighbor(aspect8, -1)) + rv(neighbor(aspect8, 1))) / 3;

  // 상대고도를 경사각(도)으로 환산해 정규화. 뒤·앞 각각 약 12° 유리 사면이면 만점에 근접.
  const FULL = (12 * Math.PI) / 180; // 만점 기준 사면각 (rad)
  const backScore = clamp(Math.atan(backRise / radiusM) / FULL, 0, 1);
  const frontScore = clamp(Math.atan(frontDrop / radiusM) / FULL, 0, 1);
  const jangpungScore = Math.round(((backScore + frontScore) / 2) * 100);

  // 배산임수: 뒤가 높고 앞이 낮으며, 의미 있는 경사가 있을 때 충족
  const baesanImsu = backRise > 0 && frontDrop > 0 && slopeDeg >= 1.5;

  // --- 현장 2점 실측 반영 (있으면 DEM 산출값을 덮어씀) ---
  const measured = override?.hyangDeg != null;
  const finalAspectDeg = measured ? round(override!.hyangDeg!, 1) : aspectDeg;
  const finalAspect8 = bearingTo8(finalAspectDeg);
  const finalBack8 = OPPOSITE[finalAspect8];
  const finalSlope = override?.axisSlopeDeg != null ? round(override.axisSlopeDeg, 2) : slopeDeg;
  const finalBaesan = override?.baesanImsu != null ? override.baesanImsu : baesanImsu;
  const paguDeg = override?.paguDeg;

  // --- 1차 룰 판정 라벨 (labels[0] = 경사 카테고리, 다른 모듈이 참조) ---
  const labels: string[] = [];
  labels.push(
    finalSlope < 3
      ? '평탄지'
      : finalSlope < 10
        ? '완경사'
        : finalSlope < 20
          ? '중경사'
          : '급경사',
  );
  labels.push(`향 ${KOR_DIR[finalAspect8]} · 배산 ${KOR_DIR[finalBack8]}`);
  labels.push(finalBaesan ? '배산임수 충족' : '배산임수 미흡');
  labels.push(
    jangpungScore >= 70
      ? '장풍 우수 (명당형)'
      : jangpungScore >= 40
        ? '장풍 보통'
        : '장풍 부족 (트인 지형)',
  );
  if (measured) labels.push('현장 2점 실측 반영');

  return {
    centerElevation: round(c),
    slopeDeg: finalSlope,
    aspectDeg: finalAspectDeg,
    aspect8: finalAspect8,
    back8: finalBack8,
    baesanImsu: finalBaesan,
    jangpungScore,
    relief,
    orientationLabel: `배산 ${KOR_DIR[finalBack8]} · 향 ${KOR_DIR[finalAspect8]}`,
    // 파구: 실측/지정값 우선, 없으면 향 방향으로 추정.
    compass:
      paguDeg != null
        ? compassReading(finalAspectDeg, paguDeg, 'manual')
        : compassReading(finalAspectDeg, finalAspectDeg, 'estimated'),
    bibo: computeBibo({ relief, aspectDeg: finalAspectDeg }),
    labels,
    samples,
  };
}
