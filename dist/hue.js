#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectHueLightData = collectHueLightData;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const config_1 = require("./config");
const datadog_1 = require("./datadog");
/**
 * Creates an HTTPS agent that ignores SSL certificate errors
 * (needed for local Hue bridge communication)
 */
const httpsAgent = new https_1.default.Agent({
    rejectUnauthorized: false
});
/**
 * Fetches light data from Philips Hue bridge
 */
async function getHueLightData() {
    try {
        const url = `https://${config_1.config.HUE_HOST}/clip/v2/resource/light`;
        const response = await axios_1.default.get(url, {
            headers: {
                'Hue-Application-Key': config_1.config.HUE_USERNAME,
            },
            httpsAgent,
        });
        return response.data;
    }
    catch (error) {
        console.error('❌ Failed to fetch Hue light data:', error);
        throw error;
    }
}
/**
 * Processes raw Hue light data into a structured format
 */
function processLightData(hueData) {
    const lightStatus = {};
    for (const light of hueData.data) {
        lightStatus[light.metadata.name] = {
            status: light.on.on,
            brightness: light.dimming.brightness,
        };
    }
    return lightStatus;
}
/**
 * Main function to collect and send Hue light data
 */
async function collectHueLightData() {
    try {
        console.log('💡 Collecting Hue light data...');
        // Fetch light data
        const rawData = await getHueLightData();
        console.log('✅ Fetched Hue light data');
        // Process data
        const lightStatus = processLightData(rawData);
        console.log('📊 Processed light data:', lightStatus);
        // Send to Datadog
        await (0, datadog_1.sendToDatadog)(lightStatus, 'raspberry-pi', {
            device: 'hue-lights',
            total_lights: Object.keys(lightStatus).length.toString()
        });
    }
    catch (error) {
        console.error('❌ Failed to collect Hue light data:', error);
        process.exit(1);
    }
}
// Allow running this file directly
if (require.main === module) {
    collectHueLightData();
}
//# sourceMappingURL=hue.js.map