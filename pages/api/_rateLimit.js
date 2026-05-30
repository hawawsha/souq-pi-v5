/**
 * Simple in-memory sliding window rate limiter.
 * Works per serverless function instance (Vercel).
 * No external dependencies required.
 */

const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, hits] of store) {
    const fresh = hits.filter(t => now - t < 60_000);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}

// Run cleanup every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, 5 * 60_000);
}

/**
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ limit: number, windowMs: number, message?: string }} options
 * @returns {boolean} true if request is allowed, false if rate-limited (response already sent)
 */
export function rateLimit(req, res, { limit, windowMs, message }) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const key = `${req.url}::${ip}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const hits = (store.get(key) || []).filter(t => t > windowStart);
  hits.push(now);
  store.set(key, hits);

  const remaining = Math.max(0, limit - hits.length);
  const resetAt = Math.ceil((hits[0] + windowMs) / 1000);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetAt));

  if (hits.length > limit) {
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json({
      error: message || 'Too many requests — please try again later.'
    });
    return false;
  }

  return true;
}
