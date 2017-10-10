export function HealthChecker() {
  const start = Date.now();
  let last = Date.now();
  return function() {
    const now = Date.now();
    const lookup_id = String(Math.random()).slice(2);
    const base = {
      success: true,
      lookup_id,
      uptime_ms: now - start,
      interval_ms: now - last
    };
    last = now;
    return {
      clear: base,
      secret: base
    };
  };
}
