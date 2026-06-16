/**
 * 현장 2점(묘 상단·하단) 패철 측정값 → 향 방위·축 경사·배산임수 산출. 순수 함수.
 *
 * - 향(向) 방위: 상단(뒤)·하단(앞)에서 측정한 패철 헤딩의 원형평균을 우선 사용하고,
 *   두 GPS 점 사이 방위(상단→하단)를 교차검증값으로 둔다.
 *   (묘는 2~3m로 작아 GPS만으로 방위를 정하면 오차가 크므로 헤딩이 우선)
 * - 축 경사·배산임수: 상단/하단 표고 차이와 두 점 거리로 계산.
 */

import { bearingBetween, distanceM } from './geo';
import { type GraveMeasurement } from '@/types/site';

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/** 방위각 원형평균(도) */
export function circularMeanDeg(degs: number[]): number | null {
  if (degs.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (x === 0 && y === 0) return null;
  return norm360((Math.atan2(y, x) * 180) / Math.PI);
}

export interface ResolvedMeasurement {
  /** 최종 향 방위각 (0~360) */
  hyangDeg: number | null;
  /** 향 산출 근거 */
  source: 'compass' | 'gps' | 'none';
  /** GPS 상단→하단 방위(교차검증용) */
  gpsBearing: number | null;
  /** 상단-하단 거리(m) */
  baselineDistM: number | null;
  /** 표고차 (상단-하단, +면 상단이 높음 = 배산 방향) */
  elevDiff: number | null;
  /** 축 경사(도) */
  axisSlopeDeg: number | null;
  /** 배산임수 충족 여부 (상단이 하단보다 높음). 표고 없으면 null */
  baesanImsu: boolean | null;
}

export function resolveMeasurement(m: GraveMeasurement): ResolvedMeasurement {
  const headings = [m.top.heading, m.bottom.heading].filter(
    (h): h is number => typeof h === 'number',
  );
  const compassMean = circularMeanDeg(headings);

  const haveBothGps =
    Number.isFinite(m.top.lng) &&
    Number.isFinite(m.top.lat) &&
    Number.isFinite(m.bottom.lng) &&
    Number.isFinite(m.bottom.lat);
  const gpsBearing = haveBothGps ? bearingBetween(m.top, m.bottom) : null; // 상단→하단 = 向
  const baselineDistM = haveBothGps ? Math.round(distanceM(m.top, m.bottom) * 10) / 10 : null;

  let hyangDeg: number | null = null;
  let source: ResolvedMeasurement['source'] = 'none';
  if (compassMean != null) {
    hyangDeg = Math.round(compassMean * 10) / 10;
    source = 'compass';
  } else if (gpsBearing != null && (baselineDistM ?? 0) >= 1) {
    hyangDeg = Math.round(gpsBearing * 10) / 10;
    source = 'gps';
  }

  const elevDiff =
    m.top.elevation != null && m.bottom.elevation != null
      ? Math.round((m.top.elevation - m.bottom.elevation) * 10) / 10
      : null;

  const axisSlopeDeg =
    elevDiff != null && baselineDistM != null && baselineDistM > 0
      ? Math.round((Math.atan(Math.abs(elevDiff) / baselineDistM) * 180) / Math.PI * 10) / 10
      : null;

  const baesanImsu = elevDiff != null ? elevDiff > 0 : null;

  return { hyangDeg, source, gpsBearing, baselineDistM, elevDiff, axisSlopeDeg, baesanImsu };
}
