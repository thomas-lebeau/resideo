import { agent, AbstractPlugin, toKebabCase } from "../shared/index.mts";

type PlexMediaServerData = Array<{
  name: string;
  type: "movie" | "show";
  count: number;
  episodeCount?: number;
  plexVersion: string;
}>;

const CONFIG = ["PLEX_HOST", "PLEX_TOKEN"] as const;

export default class PlexMediaServer extends AbstractPlugin<
  PlexMediaServerData,
  typeof CONFIG
> {
  constructor() {
    super(CONFIG);
  }

  private async getPlexData<T extends PlexEndpoint>(
    endpoint: T,
    params?: Record<string, string>
  ): Promise<PlexResponse<T>> {
    const paramsString = new URLSearchParams(params).toString();

    const response = await fetch(
      `https://${this.config.PLEX_HOST}${endpoint}?${paramsString}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Plex-Token": this.config.PLEX_TOKEN,
        },
        // @ts-expect-error - dispatcher is not defined in the fetch API types
        dispatcher: agent,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = (await response.json()) as { MediaContainer: PlexResponse<T> };

    return json.MediaContainer;
  }

  private getMediaSectionCount(
    key: number,
    params: Record<string, number> = {}
  ) {
    return this.getPlexData(`/library/sections/${key}/all`, {
      ...params,
      "X-Plex-Container-Size": "0",
      "X-Plex-Container-Start": "0",
    });
  }

  async run() {
    const identity = await this.getPlexData("/identity");
    const librarySections = await this.getPlexData("/library/sections");

    const library: PlexMediaServerData = [];

    for (const section of librarySections.Directory) {
      library.push({
        plexVersion: identity.version,
        name: toKebabCase(section.title),
        type: section.type,
        count: (await this.getMediaSectionCount(section.key)).totalSize,
        ...(section.type === "show" && {
          episodeCount: (
            await this.getMediaSectionCount(section.key, { type: 4 })
          ).totalSize,
        }),
      });
    }

    return library;
  }
}

type PlexEndpoint =
  | "/identity"
  | "/activities"
  | "/status/sessions"
  | "/library/sections"
  | `/library/sections/${number}/all`;

type PlexIdentityResponse = {
  size: number;
  apiVersion: number;
  claimed: boolean;
  machineIdentifier: string;
  version: string;
};

type PlexActivitiesResponse = {
  Activity?: Array<{
    type: "media.download";
    title: string;
    userId: string;
  }>;
};

type PlexSessionResponse = {
  Metadata: Array<{
    Player: {
      state: "playing" | "paused" | "stopped";
      machineIdentifier: string;
      platform: string;
    };
    User: {
      id: string;
      title: string;
    };
    TranscodeSession: {
      audioDecision: "copy" | "transcode";
      videoDecision: "copy" | "transcode";
    };
    title: string;
    type: "movie" | "show";
  }>;
};

type PlexLibrarySectionsResponse = {
  size: number;
  Directory: Array<{
    key: number;
    title: string;
    type: "movie" | "show";
  }>;
};

type PlexLibrarySectionAllResponse = {
  totalSize: number;
};

type PlexResponse<T extends PlexEndpoint> = T extends "/identity"
  ? PlexIdentityResponse
  : T extends "/activities"
  ? PlexActivitiesResponse
  : T extends "/status/sessions"
  ? PlexSessionResponse
  : T extends "/library/sections"
  ? PlexLibrarySectionsResponse
  : T extends `/library/sections/${number}/all`
  ? PlexLibrarySectionAllResponse
  : unknown;
