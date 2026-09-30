// Client-safe error body, shared by the global error handler and by any route
// that answers 5xx directly.
//
// 4xx messages are authored by us and stay. 5xx messages come from
// Postgres/internal code and can leak relation names, constraint text and row
// values, so in production they are logged and replaced with a generic string.
// A route that does `res.status(500).json({ error: e.message, stack: e.stack })`
// bypasses the global handler entirely and leaks a full stack trace — this
// module exists so those routes can opt in instead of re-implementing (or
// forgetting) the rule.
export function errorBody(err) {
  const status = err?.status || 500;
  if (status < 500 || process.env.NODE_ENV !== 'production') {
    return { error: err?.message || 'Internal error' };
  }
  return { error: 'Internal error' };
}
