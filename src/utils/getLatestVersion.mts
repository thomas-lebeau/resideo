import { HTTP_TIMEOUT } from "../shared/timeout.mts";

type LatestVersionResponse = {
  tag_name: string;
};

export async function getLatestVersion(): Promise<string> {
  const response = await fetch(
    "https://api.github.com/repos/thomas-lebeau/resideo/releases/latest",
    { signal: AbortSignal.timeout(HTTP_TIMEOUT) }
  );
  const data = await (response.json() as Promise<LatestVersionResponse>);

  return data.tag_name;
}
