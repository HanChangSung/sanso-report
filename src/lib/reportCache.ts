import crypto from 'crypto';

/**
 * 풍수 리포트 캐시.
 * 동일한 입력(지형 분석 + 상담정보)에 대한 리포트를 저장·재사용하여 Claude 재호출(비용)을 없앤다.
 * - 배포: Upstash Redis (sitesStore 와 동일 env 재사용).
 * - 로컬/무-Redis: 프로세스 메모리 폴백.
 */

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);
const TTL_SEC = 60 * 60 * 24 * 30; // 30일 (같은 묘소는 지형이 안 변하므로 길게)

type RedisClient = import('@upstash/redis').Redis;
let redisClient: RedisClient | null = null;
async function getRedis(): Promise<RedisClient> {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
  }
  return redisClient;
}

const memCache = new Map<string, string>(); // 폴백(프로세스 수명)

/** 모델 + 입력 payload 로 안정적인 캐시 키 생성 (입력이 같으면 같은 키) */
export function reportCacheKey(model: string, payload: unknown): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
  return `sanso:report:v1:${model}:${hash}`;
}

export async function getCachedReport(key: string): Promise<string | null> {
  try {
    if (useRedis) return (await (await getRedis()).get<string>(key)) ?? null;
    return memCache.get(key) ?? null;
  } catch {
    return null; // 캐시 조회 실패는 무시하고 신규 생성
  }
}

export async function setCachedReport(key: string, report: string): Promise<void> {
  try {
    if (useRedis) await (await getRedis()).set(key, report, { ex: TTL_SEC });
    else memCache.set(key, report);
  } catch {
    /* 캐시 저장 실패는 무시 */
  }
}
