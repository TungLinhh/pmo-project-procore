// Auth routes — login (JWT + refresh), refresh rotation, logout, logout-all, me
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  requireAuth, issueAccess, createRefreshToken, rotateRefresh,
  revokeRefresh, revokeAccess, revokeAllSessions, destroySession,
} from '../lib/auth.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.name, role: u.role, is_ceo: !!u.is_ceo, tenant_id: u.tenant_id });

router.post('/login', async (req, res) => {
  const db = getDb();
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email + password required' });
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').getAsync(email);
  if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  // Phase 2: real password check (demo users share hashed 'admin123', set by init.js).
  const okPass = user.password_hash
    ? await bcrypt.compare(password, user.password_hash)
    : false;
  if (!okPass) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  const token = issueAccess(user);
  const refresh_token = await createRefreshToken(user.id);
  res.json({ token, refresh_token, user: publicUser(user) });
});

// Single-use refresh rotation. Old refresh dies even if the response is lost
// (client must persist the newest pair) — standard rotation semantics.
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  const rotated = await rotateRefresh(refresh_token);
  if (!rotated) return res.status(401).json({ error: 'Refresh token invalid or expired' });
  res.json({ token: issueAccess(rotated.user), refresh_token: rotated.refresh, user: publicUser(rotated.user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  await destroySession(token);
  const { refresh_token } = req.body || {};
  if (refresh_token) await revokeRefresh(refresh_token);
  res.json({ ok: true });
});

// Logout everywhere: kills ALL access + refresh tokens of the caller.
router.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.user.id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
