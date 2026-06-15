import { promises as fs } from 'fs';
import path from 'path';
import { type Site } from '@/types/site';

/**
 * 묘역 좌표 저장소.
 * - 배포(서버리스): Upstash Redis (Vercel 마켓플레이스에서 생성 시 env 자동 주입).
 * - 로컬 개발: data/sites.json 파일 (Redis env 없을 때 자동 폴백).
 * 어느 쪽이든 "묘역 배열을 통째로 읽고/쓰는" 동일 인터페이스.
 */

const REDIS_KEY = 'sanso:sites';

// Vercel(Upstash) 통합이 주입하는 이름 / Upstash 기본 이름 모두 지원
const REDIS_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

type RedisClient = import('@upstash/redis').Redis;
let redisClient: RedisClient | null = null;

async function getRedis(): Promise<RedisClient> {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
  }
  return redisClient;
}

// --- 파일 폴백 (로컬 개발) ---
const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'sites.json');

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, '[]', 'utf-8');
  }
}

export async function readSites(): Promise<Site[]> {
  if (useRedis) {
    const redis = await getRedis();
    const data = await redis.get<Site[]>(REDIS_KEY);
    return Array.isArray(data) ? data : [];
  }

  await ensureFile();
  const raw = await fs.readFile(FILE, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Site[]) : [];
  } catch {
    return [];
  }
}

export async function writeSites(sites: Site[]): Promise<void> {
  if (useRedis) {
    const redis = await getRedis();
    await redis.set(REDIS_KEY, sites);
    return;
  }

  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(sites, null, 2), 'utf-8');
}
