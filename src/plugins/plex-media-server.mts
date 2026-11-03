import { agent, AbstractPlugin } from "../shared/index.mts";

type Library = MovieLibrary | ShowLibrary | MusicLibrary | PhotoLibrary;

type AbstractLibrary = {
  name: string;
  count: number;
  plexVersion: string;
};

type MovieLibrary = AbstractLibrary & {
  type: typeof TYPE.Movie;
};

type ShowLibrary = AbstractLibrary & {
  type: typeof TYPE.Show;
  episodeCount: number;
};

type MusicLibrary = AbstractLibrary & {
  type: typeof TYPE.Music;
  albumCount: number;
  trackCount: number;
};

type PhotoLibrary = AbstractLibrary & {
  type: typeof TYPE.Photo;
};

type Sessions = {
  type: typeof TYPE.Sessions;
  name: string;
  plexVersion: string;
  active_streams: number;
  transcode_count: number;
};

const TYPE = {
  Movie: "movie-library",
  Show: "show-library",
  Music: "music-library",
  Photo: "photo-library",
  Sessions: "plex-sessions",
} as const;

/**
 * Plex metadata type ids, used to count the items of a given type in a library section.
 */
const METADATA_TYPE = {
  Episode: 4,
  Album: 9,
  Track: 10,
} as const;

/**
 * Plex library section types this plugin reports on.
 */
const LIBRARY_SECTION_TYPES = ["movie", "show", "artist", "photo"] as const;

const CONFIG = ["PLEX_HOST", "PLEX_TOKEN"] as const;

export class PlexMediaServer extends AbstractPlugin<
  Library | Sessions,
  typeof CONFIG
> {
  static readonly description = "Plex Media Server library";

  constructor() {
    super(CONFIG);
  }

  private async fetch<T extends PlexEndpoint>(
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

  private async getMediaSectionCount(
    key: number,
    params: Record<string, number> = {}
  ) {
    const { totalSize } = await this.fetch(`/library/sections/${key}/all`, {
      ...params,
      "X-Plex-Container-Size": "0",
      "X-Plex-Container-Start": "0",
    });

    return totalSize;
  }

  private async getLibrary(
    section: PlexLibrarySection,
    plexVersion: string
  ): Promise<Library | undefined> {
    // The API can return section types this plugin doesn't know about
    if (!(LIBRARY_SECTION_TYPES as readonly string[]).includes(section.type)) {
      this.logger.debug(
        `Skipping library "${section.title}" of unsupported type "${section.type}"`
      );
      return undefined;
    }

    const library: AbstractLibrary = {
      plexVersion,
      name: section.title,
      count: await this.getMediaSectionCount(section.key),
    };

    switch (section.type) {
      case "movie":
        return { ...library, type: TYPE.Movie };

      case "show":
        return {
          ...library,
          type: TYPE.Show,
          episodeCount: await this.getMediaSectionCount(section.key, {
            type: METADATA_TYPE.Episode,
          }),
        };

      case "artist":
        return {
          ...library,
          type: TYPE.Music,
          albumCount: await this.getMediaSectionCount(section.key, {
            type: METADATA_TYPE.Album,
          }),
          trackCount: await this.getMediaSectionCount(section.key, {
            type: METADATA_TYPE.Track,
          }),
        };

      case "photo":
        return { ...library, type: TYPE.Photo };
    }
  }

  private async getSessions(plexVersion: string): Promise<Sessions> {
    const { Metadata: sessions = [] } = await this.fetch("/status/sessions");

    return {
      type: TYPE.Sessions,
      name: "Plex Media Server",
      plexVersion,
      active_streams: sessions.length,
      transcode_count: sessions.filter(
        ({ TranscodeSession }) =>
          TranscodeSession?.videoDecision === "transcode" ||
          TranscodeSession?.audioDecision === "transcode"
      ).length,
    };
  }

  async run() {
    const { version } = await this.fetch("/identity");
    const librarySections = await this.fetch("/library/sections");

    const results: Array<Library | Sessions> = [];

    for (const section of librarySections.Directory) {
      const library = await this.getLibrary(section, version);

      if (library) {
        results.push(library);
      }
    }

    results.push(await this.getSessions(version));

    return results;
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
  size: number;
  // Omitted when nothing is playing
  Metadata?: Array<{
    Player: {
      state: "playing" | "paused" | "stopped" | "buffering";
      machineIdentifier: string;
      platform: string;
    };
    User: {
      id: string;
      title: string;
    };
    // Omitted when the stream is played directly, without transcoding
    TranscodeSession?: {
      audioDecision: "copy" | "transcode";
      videoDecision: "copy" | "transcode";
    };
    title: string;
    type: "movie" | "episode" | "track" | "photo" | "clip";
  }>;
};

type PlexLibrarySectionType = (typeof LIBRARY_SECTION_TYPES)[number];

type PlexLibrarySection = {
  key: number;
  title: string;
  type: PlexLibrarySectionType;
};

type PlexLibrarySectionsResponse = {
  size: number;
  Directory: Array<PlexLibrarySection>;
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
