/**
 * Sends data to Datadog logs API
 */
export declare function sendToDatadog(data: any, source: string, tags?: Record<string, string>): Promise<void>;
