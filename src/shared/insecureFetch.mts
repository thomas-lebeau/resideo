import type { RequestInfo, RequestInit } from "undici";
import { Agent, fetch } from "undici";

/**
 * Agent that skips TLS certificate verification, for local devices that
 * serve self-signed certificates (Philips Hue bridge, Philips TV, Plex).
 */
export const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

/**
 * `fetch` through {@link insecureAgent}.
 *
 * It uses undici's own `fetch` rather than Node's built-in one: the built-in
 * `fetch` bundles its own undici, whose version depends on the Node version,
 * so an `Agent` from the npm package isn't guaranteed to be compatible with it.
 */
export function insecureFetch(
  input: RequestInfo,
  init: Omit<RequestInit, "dispatcher"> = {}
) {
  return fetch(input, { ...init, dispatcher: insecureAgent });
}
