import rateLimit from 'express-rate-limit';

// Rate limiting (v0.6.1): brute-force guard on auth endpoints.
// express-rate-limit was a dependency long before it was wired anywhere.
// Limits are per-IP (req.ip; trust proxy is on). Tunables via env for tests.
//
// NOTE validate.trustProxy:false — v8 refuses permissive trust-proxy setups
// because X-Forwarded-For is spoofable. Accepted here: this stack listens on
// localhost behind a Cloudflare tunnel (cloudflared sets XFF, direct remote
// connections never reach Express). Revisit if ever exposed directly.
const BASE_OPTS = { standardHeaders: false, legacyHeaders: false, validate: { trustProxy: false } };

const viMessage = { error: 'Quá nhiều lần thử, vui lòng đợi một phút rồi thử lại' };

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.LOGIN_RATE_MAX) || 10,
  message: viMessage,
  ...BASE_OPTS,
});

export const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.REFRESH_RATE_MAX) || 60,
  message: viMessage,
  ...BASE_OPTS,
});
