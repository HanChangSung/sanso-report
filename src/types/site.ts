/** 현장 패철 1점 측정값 (묘 상단/하단 각각) */
export interface PointReading {
  /** 경도 */
  lng: number;
  /** 위도 */
  lat: number;
  /** DEM 표고 (m) — 없으면 null */
  elevation: number | null;
  /** 그 지점에서 측정한 패철 향 방위각 (보정 적용, 0~360). 미측정 null */
  heading: number | null;
  /** GPS 정확도 (m) */
  accuracy: number | null;
}

/** 묘 상단부(뒤/배산)·하단부(앞/향) 2점 현장 측정 묶음 */
export interface GraveMeasurement {
  /** 상단부 (뒤/배산 쪽) */
  top: PointReading;
  /** 하단부 (앞/향 쪽) */
  bottom: PointReading;
  /** 측정 시각 (ISO 8601) */
  measuredAt: string;
}

/**
 * 묘역(Site) 데이터 모델 — 고객별/묘역별 좌표를 JSON DB(data/sites.json)에 저장.
 */
export interface Site {
  id: string;
  /** 묘역명 / 위치 라벨 (예: "울산공원묘지 A구역 12번") */
  name: string;
  /** 고객명 (선택) */
  customer: string;
  /** 상담 메모 (선택) */
  memo: string;
  /** 경도 */
  lng: number;
  /** 위도 */
  lat: number;
  /** 생성 시각 (ISO 8601) */
  createdAt: string;
  /** 현장 2점 패철 측정값 (선택) */
  measurement?: GraveMeasurement;
}

/** 신규 저장 시 클라이언트가 보내는 페이로드 */
export type NewSite = Pick<Site, 'name' | 'customer' | 'memo' | 'lng' | 'lat'>;
