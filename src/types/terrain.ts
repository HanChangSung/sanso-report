/**
 * 지형 분석(Terrain) 데이터 모델 — 3단계.
 * 클릭 좌표 + 주변 8방위 표고를 떠서 경사·사면방위·장풍(배산임수)을 계산한다.
 * (GPT 해석문은 다음 단계에서 이 숫자들을 입력으로 받아 생성)
 */

/** 8방위 (북에서 시계방향) */
export type Direction8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface LngLat {
  lng: number;
  lat: number;
}

/** 한 점의 표고 — 데이터 없으면 elevation = null */
export interface ElevationPoint extends LngLat {
  /** 표고 (m) */
  elevation: number | null;
}

/** 클릭 지점(center) + 8방위 표고 샘플 묶음 */
export interface TerrainSamples {
  center: ElevationPoint;
  /** 방위별 표고 (중심에서 radiusM 만큼 떨어진 점) */
  ring: Record<Direction8, ElevationPoint>;
  /** 샘플 반경 (m) */
  radiusM: number;
}

/** 사국(四局) */
export type Saguk = '수국' | '목국' | '화국' | '금국';

/** 24산(패철) 한 방위 */
export interface Mountain24 {
  /** 한자 (예: 午) */
  hanja: string;
  /** 한글 (예: 오) */
  kor: string;
  /** 0(子)~23, 시계방향 15° 간격 */
  index: number;
  /** 중심 방위각 (도, 북=0) */
  centerDeg: number;
}

/** 패철 좌향 + 12포태(88향법) 판정 */
export interface CompassReading {
  /** 좌(뒤) 24산 */
  jwa: Mountain24;
  /** 향(앞) 24산 */
  hyang: Mountain24;
  /** "임좌병향" 형태 */
  jwaHyangLabel: string;
  /** "壬坐丙向" 형태 */
  jwaHyangHanja: string;
  /** 파구(수구) 방위각 (도) */
  paguDeg: number;
  /** 파구 24산 */
  pagu: Mountain24;
  /** 파구 출처 — 지형추정 / 현장실측 입력 */
  paguSource: 'estimated' | 'manual';
  /** 사국 (파구로 결정) */
  saguk: Saguk;
  /** 사국 한자 (水局 등) */
  sagukHanja: string;
  /** 사국 묘고(墓庫) 지지 */
  myo: string;
  /** 향의 12포태 단계 */
  hyangPotae: string;
  /** 파구의 12포태 단계 */
  paguPotae: string;
  /** 향 포태 기준 보수적 길흉 */
  hyangFortune: '길' | '평' | '주의';
  /** 안내/주의 문구 */
  note: string;
}

/** 지형 계산 결과 (순수 숫자 + 1차 룰 판정 라벨) */
export interface TerrainAnalysis {
  /** 중심 표고 (m) */
  centerElevation: number;
  /** 경사도 (도, 0~90) */
  slopeDeg: number;
  /** 사면 방위각 — 내리막(향/앞쪽)이 향하는 방위 (0=북, 시계방향 0~360) */
  aspectDeg: number;
  /** 사면 방위의 8방위 라벨 (= 향/앞쪽) */
  aspect8: Direction8;
  /** 배산(좌/뒤) 방위 — aspect8 의 반대 */
  back8: Direction8;
  /** 배산임수 충족 여부 (뒤가 높고 앞이 낮은가) */
  baesanImsu: boolean;
  /** 장풍 점수 0~100 — 뒤·옆이 감싸고 앞이 트인 정도 */
  jangpungScore: number;
  /** 방위별 중심 대비 상대고도 (m, +면 주변이 더 높음) */
  relief: Record<Direction8, number | null>;
  /** 좌향 한글 표기 (예: "배산 북 · 향 남") */
  orientationLabel: string;
  /** 패철 24방위 좌향 + 12포태(88향법) 판정. 파구 기본은 지형추정, 사용자 수정 가능 */
  compass: CompassReading;
  /** 사람이 읽을 1차 룰 판정 라벨 (GPT 입력 전 요약) */
  labels: string[];
  /** 사용된 표고 샘플 원본 */
  samples: TerrainSamples;
}
