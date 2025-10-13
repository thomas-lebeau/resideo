type LatestVersionResponse = {
  tag_name: string;
};

export async function getLatestVersion(): Promise<string> {
  const response = await fetch(
    "https://api.github.com/repos/thomas-lebeau/resideo/releases/latest"
  );
  const data = await (response.json() as Promise<LatestVersionResponse>);

  return data.tag_name;
}
