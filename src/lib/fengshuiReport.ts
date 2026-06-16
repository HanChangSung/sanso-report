import Anthropic from '@anthropic-ai/sdk';
import { type Direction8, type TerrainAnalysis } from '@/types/terrain';
import { KOR_DIR } from './geo';

// 모델은 .env.local 의 ANTHROPIC_MODEL 로 교체 가능 (기본: Sonnet 4.6 — 풍수 해석문에 품질·비용 균형).
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

/** 상담 대상 묘역 정보 (선택) */
export interface SiteContext {
  name?: string;
  customer?: string;
  /** 현장 2점 실측 반영 시 안내 문구 */
  measurementNote?: string;
}

/** 방위별 상대고도를 사람이 읽는 한 줄로 */
function reliefLine(relief: TerrainAnalysis['relief']): string {
  return (Object.keys(relief) as Direction8[])
    .map((d) => {
      const v = relief[d];
      if (v == null) return `${KOR_DIR[d]} 데이터없음`;
      const sign = v > 0 ? '+' : '';
      return `${KOR_DIR[d]} ${sign}${v}m`;
    })
    .join(', ');
}

/** 지형 분석 수치를 Claude 프롬프트용 텍스트로 정리 */
function buildAnalysisBrief(a: TerrainAnalysis, site?: SiteContext): string {
  const c = a.compass;
  const lines = [
    site?.name ? `묘역: ${site.name}` : null,
    site?.customer ? `고객: ${site.customer}` : null,
    `중심 표고: ${a.centerElevation}m`,
    `경사도: ${a.slopeDeg}° (${a.labels[0]})`,
    `좌향(방위): ${a.orientationLabel} — 향 방위각 ${a.aspectDeg}°`,
    `배산임수: ${a.baesanImsu ? '충족 (뒤가 높고 앞이 트임)' : '미흡'}`,
    `장풍 점수: ${a.jangpungScore}/100`,
    `주변 8방위 상대고도(중심 대비, +면 주변이 더 높음): ${reliefLine(a.relief)}`,
    '',
    '[패철·포태법 계산값 — 아래 수치는 이미 정확히 계산된 것이니 그대로 인용하고, 절대 다시 계산하지 마십시오]',
    `좌향(24산): ${c.jwaHyangLabel} (${c.jwaHyangHanja})`,
    `파구(수구): ${c.pagu.kor}(${c.pagu.hanja}) 방, ${c.paguDeg}° — ${
      c.paguSource === 'estimated' ? '지형 추정치' : '현장 실측 입력'
    }`,
    `사국(四局): ${c.saguk}(${c.sagukHanja}), 묘고 ${c.myo}`,
    `12포태 — 향: ${c.hyangPotae} / 파구: ${c.paguPotae} (향 포태 기준 보수적 길흉: ${c.hyangFortune})`,
    `유의: ${c.note}`,
    '',
    '[비보(裨補) 가이드 — 아래 항목만 사용하고 새 방위를 지어내지 마세요. 각 항목을 위치/설치물/효과로 풀어 쓰세요]',
    `종합: ${a.bibo.summary}`,
    ...a.bibo.items.map(
      (b, i) =>
        `${i + 1}) ${b.dirKor}(${b.role}, 방위각 ${b.bearingDeg}°, 상대고도 ${b.relief}m, 시급도 ${b.severity}) — 위치: ${b.distance} ${b.dirKor}쪽 / 설치물: ${b.remedy} / 효과: ${b.effect}`,
    ),
    site?.measurementNote ? `\n[현장 실측] ${site.measurementNote} → 위 좌향·경사·배산임수는 DEM 추정이 아니라 현장 실측 기반이므로 신뢰도가 높습니다. 해석에 이 점을 반영하세요.` : null,
  ].filter((l) => l !== null);
  return lines.join('\n');
}

const SYSTEM_PROMPT = `당신은 한국 전통 풍수지리(風水地理) 명당 이론에 정통한 전문가이자, 현대 지형정보(GIS) 데이터를 함께 해석하는 묘지 컨설턴트입니다.
주어진 객관적 지형 수치(표고, 경사, 사면 방위, 배산임수, 장풍 점수, 방위별 상대고도)와 패철(나경) 좌향·12포태법 계산값을 근거로, 고객 상담에 바로 쓸 수 있는 풍수 해석 리포트를 작성합니다.

작성 원칙:
- 반드시 주어진 수치에 근거해 해석하고, 수치와 모순되는 단정은 피합니다.
- 패철 좌향(24산)·사국·12포태 단계는 이미 정확히 계산되어 제공됩니다. 이 값들은 그대로 인용만 하고 절대 다시 계산하거나 다른 방위로 바꾸지 마십시오.
- 12포태(88향법)는 파구(수구)에 좌우됩니다. 파구가 '지형 추정치'이면, 해석에 그 한계를 한 문장 반영하고 "현장 패철 실측으로 확정 권장"을 덧붙입니다.
- 전통 풍수 용어(배산임수, 장풍득수, 좌향, 현무·주작, 사국, 포태 등)를 적절히 쓰되, 각 판단의 근거가 어떤 수치인지 자연스럽게 드러냅니다.
- 차분하고 전문적인 상담 어조. 미신적 단정이나 길흉 과장은 피하고, 지형적 장점과 유의점을 균형 있게 제시합니다.
- 【비보(裨補) 전략】에서는 제공된 비보 가이드 항목만 사용해, 각 항목을 "위치 / 설치물 / 효과" 형식으로 구체적으로 안내합니다. 제공 항목이 없으면 비보가 필수적이지 않다고 적습니다. 새로운 방위나 석물을 임의로 지어내지 마십시오.
- 전체 550~750자 내외의 한국어. 아래 6개 소제목을 사용합니다:
  【종합 평가】 / 【장풍·배산임수】 / 【좌향(방위)】 / 【패철 좌향·포태】 / 【비보(裨補) 전략】 / 【상담 코멘트】`;

/**
 * 지형 분석 수치를 받아 Claude(Sonnet 4.6 기본)로 풍수 해석 리포트 텍스트를 생성한다.
 * 서버 전용 — ANTHROPIC_API_KEY 필요.
 */
export async function generateFengshuiReport(
  analysis: TerrainAnalysis,
  site?: SiteContext,
): Promise<string> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY 를 환경변수에서 자동 사용

  const brief = buildAnalysisBrief(analysis, site);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `다음 묘역 지형 분석 결과를 바탕으로 풍수 해석 리포트를 작성해 주세요.\n\n${brief}`,
      },
    ],
  });

  // content 는 블록 배열 — text 블록만 모아 반환
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
