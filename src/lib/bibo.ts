/**
 * 비보(裨補) 전략 — 허(虛)한 방위를 석물·식재로 보완하는 가이드를 결정론적으로 산출.
 *
 * 풍수에서 주변이 낮거나 트인 방위는 '기운이 새어 나가는 자리'로 본다. 8방위 상대고도와
 * 향(向)을 기준으로 사신사(현무·청룡·백호·주작) 역할을 판정하고, 역할별로 적절한
 * 방풍·결계 석물 배치를 제안한다. (해석문은 Claude가 이 결과를 풀어 쓴다.)
 */

import { type BiboItem, type BiboPlan, type Direction8 } from '@/types/terrain';
import { DIRECTIONS_8, DIRECTION_BEARINGS, KOR_DIR } from './geo';
import { angularDelta } from './orientation';

/** 허함 판정 임계: 상대고도(m)가 이보다 낮으면 보완 대상 */
const LOW = -2;
/** 주작(앞)은 트여야 좋으므로 매우 낮을 때만(임수 영역) 안산 보완 */
const FRONT_LOW = -5;

function roleOf(deltaToFront: number): BiboItem['role'] {
  const a = Math.abs(deltaToFront);
  if (a <= 45) return '주작(앞)';
  if (a >= 135) return '현무(뒤)';
  return deltaToFront > 0 ? '백호(우)' : '청룡(좌)'; // 향 기준 시계방향=오른쪽
}

function remedyFor(role: BiboItem['role']): { remedy: string; effect: string } {
  switch (role) {
    case '현무(뒤)':
      return {
        remedy: "'병풍석' 설치 또는 성토·상록수(소나무) 식재로 뒤를 돋움",
        effect: '허한 현무(뒤)를 보강해 묘역의 의지처(주산)를 세우고 뒤로 새는 기운을 막음',
      };
    case '주작(앞)':
      return {
        remedy: "낮은 '조산석'·석등으로 안산 역할 보완 (향과 시야는 막지 않게 낮게)",
        effect: '지나치게 트인 앞쪽에 안산을 더해 기운이 곧장 빠져나가지 않게 함',
      };
    default: // 청룡/백호 측면
      return {
        remedy: "'문인석'·'망주석' 한 쌍 또는 '병풍석'·향나무 식재로 측면을 감쌈",
        effect: '낮은 측면의 찬 기운을 물리적으로 차단하고(방풍) 묘역을 감싸는(결계) 역할',
      };
  }
}

export function computeBibo(input: {
  relief: Record<Direction8, number | null>;
  aspectDeg: number;
}): BiboPlan {
  const { relief, aspectDeg } = input;

  const items: BiboItem[] = [];
  for (const d of DIRECTIONS_8) {
    const v = relief[d];
    if (v == null) continue;
    const bearingDeg = DIRECTION_BEARINGS[d];
    const role = roleOf(angularDelta(bearingDeg, aspectDeg));
    const threshold = role === '주작(앞)' ? FRONT_LOW : LOW;
    if (v > threshold) continue; // 충분히 높거나 평탄 → 보완 불필요

    const { remedy, effect } = remedyFor(role);
    items.push({
      dir: d,
      dirKor: KOR_DIR[d],
      bearingDeg,
      relief: v,
      role,
      severity: v <= -5 ? '높음' : '보통',
      remedy,
      distance: '묘 중심에서 약 3~5m',
      effect,
    });
  }

  // 더 허한(낮은) 방위 우선, 최대 3건
  items.sort((a, b) => a.relief - b.relief);
  const top = items.slice(0, 3);

  const summary =
    top.length === 0
      ? '주변 사신사가 비교적 균형 있게 감싸고 있어 별도의 비보 석물은 필수적이지 않습니다. 기존 지형을 살리되 묘역 경계 정비 정도를 권합니다.'
      : `${top.map((i) => i.dirKor).join('·')} 방위가 낮아 기운이 새기 쉽습니다. 아래 비보 석물 배치로 방풍·결계를 보완하길 권합니다.`;

  return { items: top, summary };
}
