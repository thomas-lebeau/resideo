import semver from "semver";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/thomas-lebeau/resideo/releases/latest";

type LatestVersionResponse = {
  tag_name?: unknown;
};

/**
 * Returns the tag of the latest GitHub release (e.g. `v3.2.3`).
 *
 * Throws when GitHub doesn't answer with a release (rate limit, outage...) or
 * when the tag isn't a `v`-prefixed semver version. The tag ends up in a shell
 * command run with sudo, so nothing else is accepted.
 */
export async function getLatestVersion(): Promise<string> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(
      `Could not get the latest release from GitHub: HTTP ${response.status} ${response.statusText}`.trim()
    );
  }

  const { tag_name } = (await response.json()) as LatestVersionResponse;

  if (!isReleaseTag(tag_name)) {
    throw new Error(
      `Unexpected tag name for the latest release: ${JSON.stringify(tag_name)}`
    );
  }

  return tag_name;
}

function isReleaseTag(tag: unknown): tag is string {
  if (typeof tag !== "string") {
    return false;
  }

  const version = semver.valid(tag);

  return version !== null && tag === `v${version}`;
}
