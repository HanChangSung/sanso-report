/**
 * 패철(나경)·12포태법 계산 — 순수 함수 (서버·클라이언트 공용, 외부 의존 없음).
 *
 * 법칙적 계산은 전부 여기서 결정론적으로 수행하고, Claude 해석문은 그 결과를
 * "설명"만 하게 한다. (LLM에 포태/사국 계산을 맡기면 환각이 나므로 분리)
 *
 * - 24방위(24山): 360°를 15°씩 24등분. 子=정북(0°) 중심, 시계방향.
 * - 12포태법: 향상포태(向上胞胎) 88향법 방식. 파구(破口/수구)로 사국(四局)을
 *   정하고, 4국 기준 12포태를 24산에 順行 배치한다.
 *   ⚠️ 파구는 본래 현장 패철로 물 빠지는 방위를 실측해야 정확하다. 본 서비스의
 *   기본값은 지형(내리막 방향)으로 추정한 근사치이며, 사용자가 실측값으로 수정 가능.
 */

import { type CompassReading, type Mountain24, type Saguk } from '@/types/terrain';

/** 24산 — index 0(子=정북)부터 시계방향 15° 간격 */
const M24: { hanja: string; kor: string }[] = [
  { hanja: '子', kor: '자' }, // 0   0°
  { hanja: '癸', kor: '계' }, // 1   15°
  { hanja: '丑', kor: '축' }, // 2   30°
  { hanja: '艮', kor: '간' }, // 3   45°
  { hanja: '寅', kor: '인' }, // 4   60°
  { hanja: '甲', kor: '갑' }, // 5   75°
  { hanja: '卯', kor: '묘' }, // 6   90°
  { hanja: '乙', kor: '을' }, // 7   105°
  { hanja: '辰', kor: '진' }, // 8   120°
  { hanja: '巽', kor: '손' }, // 9   135°
  { hanja: '巳', kor: '사' }, // 10  150°
  { hanja: '丙', kor: '병' }, // 11  165°
  { hanja: '午', kor: '오' }, // 12  180°
  { hanja: '丁', kor: '정' }, // 13  195°
  { hanja: '未', kor: '미' }, // 14  210°
  { hanja: '坤', kor: '곤' }, // 15  225°
  { hanja: '申', kor: '신' }, // 16  240°
  { hanja: '庚', kor: '경' }, // 17  255°
  { hanja: '酉', kor: '유' }, // 18  270°
  { hanja: '辛', kor: '신' }, // 19  285°  (申과 한글 동일 → 한자로 구분)
  { hanja: '戌', kor: '술' }, // 20  300°
  { hanja: '乾', kor: '건' }, // 21  315°
  { hanja: '亥', kor: '해' }, // 22  330°
  { hanja: '壬', kor: '임' }, // 23  345°
];

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** 방위각(도) → 24산 */
export function to24(deg: number): Mountain24 {
  const n = norm360(deg);
  const index = Math.round(n / 15) % 24;
  const m = M24[index];
  return { hanja: m.hanja, kor: m.kor, index, centerDeg: index * 15 };
}

/** 12지지 순서 (子=0 … 亥=11, 30° 간격) */
const STAGES: string[] = [
  '장생', '목욕', '관대', '임관', '제왕', '쇠', '병', '사', '묘', '절', '태', '양',
];

/** 24산 index → 12지지 index (쌍산: 천간·괘는 짝이 되는 지지에 귀속) */
function branchIndex(mountainIndex: number): number {
  // 지지는 짝수 index(子0,丑2,…亥22). 천간·괘(홀수)는 바로 뒤 지지에 붙는다(壬23→子0).
  const zodiacMountain = mountainIndex % 2 === 0 ? mountainIndex : (mountainIndex + 1) % 24;
  return zodiacMountain / 2; // 子0,丑1,…亥11
}

/** 4국별 장생(長生) 지지 index */
const SAENG_BRANCH: Record<Saguk, number> = {
  수국: 8, // 申
  목국: 11, // 亥
  화국: 2, // 寅
  금국: 5, // 巳
};

const SAGUK_HANJA: Record<Saguk, string> = {
  수국: '水局',
  목국: '木局',
  화국: '火局',
  금국: '金局',
};

/** 4국 묘고(墓庫) 지지 한글 */
const SAGUK_MYO: Record<Saguk, string> = {
  수국: '진(辰)',
  목국: '미(未)',
  화국: '술(戌)',
  금국: '축(丑)',
};

/** 파구(破口) 방위각 → 사국(四局). 가장 가까운 묘고(辰120·未210·戌300·丑30)로 귀속. */
export function sagukFromPagu(paguDeg: number): Saguk {
  const n = norm360(paguDeg);
  if (n >= 75 && n < 165) return '수국'; // 辰 120°
  if (n >= 165 && n < 255) return '목국'; // 未 210°
  if (n >= 255 && n < 345) return '화국'; // 戌 300°
  return '금국'; // 丑 30° (345~360, 0~75)
}

/** 특정 방위(24산)의 12포태 단계 (해당 사국 기준) */
export function potaeOf(deg: number, saguk: Saguk): string {
  const bi = branchIndex(to24(deg).index);
  const offset = (bi - SAENG_BRANCH[saguk] + 12) % 12;
  return STAGES[offset];
}

/** 향의 포태 단계 → 음택 일반 길흉(보수적). 정밀 88향 길흉은 향·파구 조합이라 별도. */
function fortuneOf(potae: string): CompassReading['hyangFortune'] {
  if (['장생', '관대', '임관', '제왕'].includes(potae)) return '길';
  if (['양', '태', '목욕', '쇠'].includes(potae)) return '평';
  return '주의'; // 병·사·묘·절
}

/**
 * 향 방위각 + 파구 방위각 → 패철 좌향·사국·12포태 종합.
 * @param hyangDeg 향(앞) 방위각 0~360 (= aspectDeg, 내리막 방향)
 * @param paguDeg  파구(수구) 방위각. 기본은 지형 추정치(보통 향과 동일), 사용자 수정 가능
 * @param paguSource 'estimated' | 'manual'
 */
export function compassReading(
  hyangDeg: number,
  paguDeg: number,
  paguSource: CompassReading['paguSource'],
): CompassReading {
  const hyang = to24(hyangDeg);
  const jwa = to24(hyangDeg + 180); // 좌(뒤) = 향의 반대
  const pagu = to24(paguDeg);
  const saguk = sagukFromPagu(paguDeg);

  const hyangPotae = potaeOf(hyangDeg, saguk);
  const paguPotae = potaeOf(paguDeg, saguk);
  const hyangFortune = fortuneOf(hyangPotae);

  const note =
    paguSource === 'estimated'
      ? '파구는 지형 내리막 방향으로 추정한 값입니다. 정확한 판단은 현장 패철로 수구를 실측해 수정하십시오.'
      : '파구는 현장 실측값으로 입력되었습니다.';

  return {
    jwa,
    hyang,
    jwaHyangLabel: `${jwa.kor}좌 ${hyang.kor}향`,
    jwaHyangHanja: `${jwa.hanja}坐 ${hyang.hanja}向`,
    paguDeg: Math.round(norm360(paguDeg) * 10) / 10,
    pagu,
    paguSource,
    saguk,
    sagukHanja: SAGUK_HANJA[saguk],
    myo: SAGUK_MYO[saguk],
    hyangPotae,
    paguPotae,
    hyangFortune,
    note,
  };
}

/** UI(파구 수정 드롭다운)용 24산 목록 — 한글(한자) 라벨 + 중심 방위각 */
export const MOUNTAINS_24: { index: number; label: string; deg: number }[] = M24.map(
  (m, i) => ({ index: i, label: `${m.kor}(${m.hanja})`, deg: i * 15 }),
);
