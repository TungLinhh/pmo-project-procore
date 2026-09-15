// Rate limiting (v0.6.1): brute-force guard on auth endpoints.
// express-rate-limit was a dependency long before it was wired anywhere.
// Limits are per-IP (req.ip; trust proxy is on). Tunables via env for tests.
import rateLimit from 'express-rate-limit';

const viMessage = { error: 'Quá nhiều lần thử, vui lòng đợi một phút rồi thử lại' };

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.LOGIN_RATE_MAX) || 10,
  message: viMessage,
  standardHeaders: false,
  legacyHeaders: false,
});

export const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.REFRESH_RATE_MAX) || 60,
  message: viMessage,
  standardHeaders: false,
  legacyHeaders: false,
});
