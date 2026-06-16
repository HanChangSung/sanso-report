// 로컬 data/sites.json 묘역을 배포 Upstash(Redis)로 안전 이전(머지)하는 1회성 스크립트.
//
// 사용법 (PowerShell, fnm 활성화 후):
//   node scripts/migrate-sites-to-upstash.mjs            # 실제 이전
//   node scripts/migrate-sites-to-upstash.mjs --dry-run  # 미리보기(쓰기 안 함)
//
// 접속 정보는 .env.local에서 직접 읽음(KV_REST_API_URL/TOKEN 또는 UPSTASH_REDIS_REST_URL/TOKEN).
// 머지 규칙: 원격에 이미 있는 묘역은 보존, 같은 id는 로컬 값으로 갱신, 로컬에만 있는 건 추가.

import { promises as fs } from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';

const REDIS_KEY = 'sanso:sites';
const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

// --- .env.local 파싱 (필요한 키만) ---
async function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  const raw = await fs.readFile(file, 'utf-8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

async function main() {
  const env = await loadEnvLocal();
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error(
      '✗ Upstash 접속 정보가 .env.local에 없습니다.\n' +
        '  Vercel 대시보드 → Storage(또는 Settings→Environment Variables)에서\n' +
        '  KV_REST_API_URL / KV_REST_API_TOKEN 값을 복사해 .env.local에 추가하세요.'
    );
    process.exit(1);
  }

  // 로컬 묘역
  const localRaw = await fs.readFile(path.join(ROOT, 'data', 'sites.json'), 'utf-8');
  const local = JSON.parse(localRaw);
  if (!Array.isArray(local)) throw new Error('data/sites.json 형식 오류(배열 아님)');

  const redis = new Redis({ url, token });
  const remoteVal = await redis.get(REDIS_KEY);
  const remote = Array.isArray(remoteVal) ? remoteVal : [];

  console.log(`로컬 묘역: ${local.length}건`);
  console.log(`원격(Upstash) 기존 묘역: ${remote.length}건`);

  // 머지: id 기준. 원격을 베이스로, 로컬로 갱신/추가.
  const byId = new Map();
  for (const s of remote) byId.set(s.id, s);
  let added = 0;
  let updated = 0;
  for (const s of local) {
    if (byId.has(s.id)) updated++;
    else added++;
    byId.set(s.id, s);
  }
  const merged = [...byId.values()];

  // createdAt 내림차순 정렬(최신이 위) — 앱 표시 일관성
  merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  console.log(`머지 결과: 총 ${merged.length}건 (신규 추가 ${added}, 갱신 ${updated})`);
  console.log('— 묘역 목록 —');
  for (const s of merged) console.log(`  · ${s.name} / ${s.customer ?? '-'} (${s.id.slice(0, 8)})`);

  if (DRY_RUN) {
    console.log('\n[--dry-run] 쓰기를 건너뜁니다.');
    return;
  }

  await redis.set(REDIS_KEY, merged);
  console.log(`\n✓ Upstash에 ${merged.length}건 저장 완료.`);
}

main().catch((e) => {
  console.error('✗ 실패:', e.message ?? e);
  process.exit(1);
});
