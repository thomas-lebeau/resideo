/**
 * Timeout for an HTTP request, from sending it to reading the whole body.
 * Pass it as `signal: AbortSignal.timeout(HTTP_TIMEOUT)` so a hung host makes
 * the request fail instead of stalling the run (undici waits up to 5 minutes).
 */
export const HTTP_TIMEOUT = 10_000;
