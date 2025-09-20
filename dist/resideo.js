#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectThermostatData = collectThermostatData;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
const datadog_1 = require("./datadog");
/**
 * Gets OAuth access token from Resideo API
 */
async function getAccessToken() {
    try {
        const basicAuth = Buffer.from(`${config_1.config.API_KEY}:${config_1.config.API_SECRET}`).toString('base64');
        const response = await axios_1.default.post('https://api.honeywell.com/oauth2/accesstoken', 'grant_type=client_credentials', {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data.access_token;
    }
    catch (error) {
        console.error('❌ Failed to get access token:', error);
        throw error;
    }
}
/**
 * Fetches thermostat data from Resideo API
 */
async function getThermostatData(accessToken) {
    try {
        const url = `https://api.honeywell.com/v2/devices/thermostats/${config_1.config.DEVICE_ID}`;
        const params = {
            apikey: config_1.config.API_KEY,
            locationId: config_1.config.LOCATION_ID,
        };
        const response = await axios_1.default.get(url, {
            params,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'UserRefID': config_1.config.USER_REF_ID,
            },
        });
        return response.data;
    }
    catch (error) {
        console.error('❌ Failed to fetch thermostat data:', error);
        throw error;
    }
}
/**
 * Processes raw thermostat data into a structured format
 */
function processThermostatData(data) {
    return {
        mode: data.changeableValues.mode,
        heatSetpoint: data.changeableValues.heatSetpoint,
        operationMode: data.operationStatus.mode,
        outdoorTemperature: data.outdoorTemperature,
        indoorTemperature: data.indoorTemperature,
    };
}
/**
 * Main function to collect and send thermostat data
 */
async function collectThermostatData() {
    try {
        console.log('🌡️  Collecting thermostat data...');
        // Get access token
        const accessToken = await getAccessToken();
        console.log('✅ Got access token');
        // Fetch thermostat data
        const rawData = await getThermostatData(accessToken);
        console.log('✅ Fetched thermostat data');
        // Process data
        const thermostatData = processThermostatData(rawData);
        console.log('📊 Processed data:', thermostatData);
        // Send to Datadog
        await (0, datadog_1.sendToDatadog)(thermostatData, 'resideo-gh-action', {
            device: 'thermostat',
            location: config_1.config.LOCATION_ID
        });
    }
    catch (error) {
        console.error('❌ Failed to collect thermostat data:', error);
        process.exit(1);
    }
}
// Allow running this file directly
if (require.main === module) {
    collectThermostatData();
}
//# sourceMappingURL=resideo.js.map