import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type TransmissionData = {
  type: "transmission";
  name: string;
  active_torrent_count: number;
  download_speed: number;
  paused_torrent_count: number;
  torrent_count: number;
  upload_speed: number;
  total_downloaded: number;
  total_uploaded: number;
  total_files_added: number;
  total_session_count: number;
  total_seconds_active: number;
};

type Endpoint = "session-stats";

type SessionStatsResponse = {
  activeTorrentCount: number;
  downloadSpeed: number; // bytes per second
  pausedTorrentCount: number;
  torrentCount: number;
  uploadSpeed: number; // bytes per second
  "cumulative-stats": {
    uploadedBytes: number;
    downloadedBytes: number;
    filesAdded: number;
    sessionCount: number;
    secondsActive: number;
  };
};

type TransmissionResponse<T extends Endpoint> = T extends "session-stats"
  ? SessionStatsResponse
  : never;

const CONFIG = [
  "TRANSMISSION_HOST",
  "TRANSMISSION_USERNAME",
  "TRANSMISSION_PASSWORD",
] as const;

export class Transmission extends AbstractPlugin<
  TransmissionData,
  typeof CONFIG
> {
  public static readonly description = "Transmission client";
  private sessionId: string | undefined;

  constructor() {
    super(CONFIG);
  }

  async fetch<T extends Endpoint>(
    endpoint: T
  ): Promise<TransmissionResponse<T>> {
    const response = await fetch(
      `http://${this.config.TRANSMISSION_HOST}/transmission/rpc`,
      {
        method: "POST",
        headers: {
          "X-Transmission-Session-Id": this.sessionId,
          Authorization:
            "Basic " +
            Buffer.from(
              `${this.config.TRANSMISSION_USERNAME}:${this.config.TRANSMISSION_PASSWORD}`
            ).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: endpoint,
        }),
      }
    );

    if (response.status === 409) {
      this.sessionId =
        response.headers.get("X-Transmission-Session-Id") ?? undefined;
      return this.fetch<T>(endpoint);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as {
      arguments: TransmissionResponse<T>;
    };

    return data.arguments;
  }

  async run() {
    const stats = await this.fetch("session-stats");

    return {
      type: "transmission",
      name: "Transmission",
      active_torrent_count: stats.activeTorrentCount,
      download_speed: stats.downloadSpeed,
      paused_torrent_count: stats.pausedTorrentCount,
      torrent_count: stats.torrentCount,
      upload_speed: stats.uploadSpeed,
      total_downloaded: stats["cumulative-stats"].downloadedBytes,
      total_uploaded: stats["cumulative-stats"].uploadedBytes,
      total_files_added: stats["cumulative-stats"].filesAdded,
      total_session_count: stats["cumulative-stats"].sessionCount,
      total_seconds_active: stats["cumulative-stats"].secondsActive,
    } satisfies TransmissionData;
  }
}
