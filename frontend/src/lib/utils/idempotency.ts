/**
 * Generate a client-side idempotency key for at-least-once-safe mutations
 * (checkout submit, payment initiate). The key is random; the backend also
 * binds it to a hash of the request body so a replay with different data
 * yields 409 (common.idempotency_conflict) rather than silently reusing.
 */
export function createIdempotencyKey(prefix = "web"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}
