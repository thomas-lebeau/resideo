"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToDatadog = sendToDatadog;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
/**
 * Sends data to Datadog logs API
 */
async function sendToDatadog(data, source, tags = {}) {
    try {
        const tagString = Object.entries({ version: '2.0', ...tags })
            .map(([key, value]) => `${key}:${value}`)
            .join(',');
        const url = `https://http-intake.logs.datadoghq.eu/api/v2/logs?ddsource=${source}&ddtags=${tagString}`;
        const payload = {
            message: typeof data === 'string' ? data : JSON.stringify(data),
            timestamp: new Date().toISOString(),
            ...data
        };
        await axios_1.default.post(url, payload, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'DD-API-KEY': config_1.config.DD_API_KEY,
            },
        });
        console.log(`✅ Successfully sent ${source} data to Datadog`);
    }
    catch (error) {
        console.error(`❌ Failed to send data to Datadog:`, error);
        throw error;
    }
}
//# sourceMappingURL=datadog.js.map