import Anthropic from '@anthropic-ai/sdk';
import { type Direction8, type TerrainAnalysis } from '@/types/terrain';
import { KOR_DIR } from './geo';

// 모델은 .env.local 의 ANTHROPIC_MODEL 로 교체 가능 (기본: Sonnet 4.6 — 풍수 해석문에 품질·비용 균형).
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

/** 상담 대상 묘역 정보 (선택) */
export interface SiteContext {
  name?: string;
  customer?: string;
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
  const lines = [
    site?.name ? `묘역: ${site.name}` : null,
    site?.customer ? `고객: ${site.customer}` : null,
    `중심 표고: ${a.centerElevation}m`,
    `경사도: ${a.slopeDeg}° (${a.labels[0]})`,
    `좌향(방위): ${a.orientationLabel} — 향 방위각 ${a.aspectDeg}°`,
    `배산임수: ${a.baesanImsu ? '충족 (뒤가 높고 앞이 트임)' : '미흡'}`,
    `장풍 점수: ${a.jangpungScore}/100`,
    `주변 8방위 상대고도(중심 대비, +면 주변이 더 높음): ${reliefLine(a.relief)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

const SYSTEM_PROMPT = `당신은 한국 전통 풍수지리(風水地理) 명당 이론에 정통한 전문가이자, 현대 지형정보(GIS) 데이터를 함께 해석하는 묘지 컨설턴트입니다.
주어진 객관적 지형 수치(표고, 경사, 사면 방위, 배산임수, 장풍 점수, 방위별 상대고도)를 근거로, 고객 상담에 바로 쓸 수 있는 풍수 해석 리포트를 작성합니다.

작성 원칙:
- 반드시 주어진 수치에 근거해 해석하고, 수치와 모순되는 단정은 피합니다.
- 전통 풍수 용어(배산임수, 장풍득수, 좌향, 현무·주작 등)를 적절히 쓰되, 각 판단의 근거가 어떤 수치인지 자연스럽게 드러냅니다.
- 차분하고 전문적인 상담 어조. 미신적 단정이나 길흉 과장은 피하고, 지형적 장점과 유의점을 균형 있게 제시합니다.
- 전체 350~550자 내외의 한국어. 아래 4개 소제목을 사용합니다:
  【종합 평가】 / 【장풍·배산임수】 / 【좌향(방위)】 / 【상담 코멘트】`;

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
