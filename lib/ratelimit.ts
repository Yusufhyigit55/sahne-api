// lib/ratelimit.ts : Upstash Redis tabanlı rate limiting.
// Env (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) yoksa sessizce devre dışı kalır,
// böylece kurulum yapılmadan da uygulama çalışır.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Env runtime'da okunur (build sırasında değil — Vercel build'i bozulmasın)
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Limiter'ları lazy oluştur (ilk kullanımda), env yoksa null
let _authLimiter: Ratelimit | null | undefined;
let _apiLimiter: Ratelimit | null | undefined;

function getAuthLimiter(): Ratelimit | null {
  if (_authLimiter === undefined) {
    const redis = getRedis();
    _authLimiter = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(10, "60 s"), // 60 saniyede 10 istek
          prefix: "rl:auth",
        })
      : null;
  }
  return _authLimiter;
}

function getApiLimiter(): Ratelimit | null {
  if (_apiLimiter === undefined) {
    const redis = getRedis();
    _apiLimiter = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(100, "60 s"), // 60 saniyede 100 istek
          prefix: "rl:api",
        })
      : null;
  }
  return _apiLimiter;
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
};

/**
 * İsteği rate limit'e sokar. identifier genelde IP adresi.
 * Env yoksa her zaman ok:true döner (rate limit devre dışı).
 */
export async function checkRateLimit(
  identifier: string,
  kind: "auth" | "api" = "api"
): Promise<RateLimitResult> {
  const limiter = kind === "auth" ? getAuthLimiter() : getApiLimiter();
  if (!limiter) {
    // Upstash yapılandırılmamış → geçir
    return { ok: true, remaining: -1 };
  }
  try {
    const { success, remaining } = await limiter.limit(identifier);
    return { ok: success, remaining };
  } catch {
    // Redis hatası ana akışı bozmasın → geçir
    return { ok: true, remaining: -1 };
  }
}

/** İstekten IP adresi çıkarır (Vercel/proxy başlıklarından). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}