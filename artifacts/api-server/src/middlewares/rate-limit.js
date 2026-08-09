const activeStores = new Set();

function resetRateLimits() {
  for (const store of activeStores) {
    store.clear();
  }
}

function rateLimit(options = {}) {
  const {
    windowMs = 60000,
    max = 100,
    message = "Too many requests, please try again later.",
    scope = "global",
    keyGenerator = (req) => `${scope}:${req.ip ?? req.socket?.remoteAddress ?? "unknown"}`
  } = options;

  const store = new Map();
  activeStores.add(store);

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, Math.min(windowMs, 60000)).unref();

  const middleware = (req, res, next) => {
    if (process.env.NODE_ENV === "test" && req.headers && req.headers["x-reset-rate-limit"]) {
      store.clear();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };

  middleware.store = store;
  middleware.reset = () => store.clear();

  return middleware;
}

export {
  rateLimit,
  resetRateLimits
};
