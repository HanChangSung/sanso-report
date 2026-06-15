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
}

/** 신규 저장 시 클라이언트가 보내는 페이로드 */
export type NewSite = Pick<Site, 'name' | 'customer' | 'memo' | 'lng' | 'lat'>;
