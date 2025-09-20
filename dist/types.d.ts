/**
 * Configuration interface for environment variables
 */
export interface Config {
    API_KEY: string;
    API_SECRET: string;
    DEVICE_ID: string;
    LOCATION_ID: string;
    USER_REF_ID: string;
    HUE_HOST: string;
    HUE_USERNAME: string;
    DD_API_KEY: string;
}
/**
 * Resideo API OAuth token response
 */
export interface ResideoTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}
/**
 * Resideo thermostat device response
 */
export interface ResideoDeviceResponse {
    changeableValues: {
        mode: string;
        heatSetpoint: number;
        coolSetpoint?: number;
    };
    operationStatus: {
        mode: string;
    };
    outdoorTemperature: number;
    indoorTemperature: number;
}
/**
 * Processed thermostat data for logging
 */
export interface ThermostatData {
    mode: string;
    heatSetpoint: number;
    operationMode: string;
    outdoorTemperature: number;
    indoorTemperature: number;
}
/**
 * Philips Hue light data from API
 */
export interface HueLight {
    id: string;
    metadata: {
        name: string;
    };
    on: {
        on: boolean;
    };
    dimming: {
        brightness: number;
    };
}
/**
 * Hue API response
 */
export interface HueResponse {
    data: HueLight[];
}
/**
 * Processed light data for logging
 */
export interface LightStatus {
    [lightName: string]: {
        status: boolean;
        brightness: number;
    };
}
/**
 * Datadog log payload
 */
export interface DatadogLogPayload {
    message: string;
    timestamp?: string;
    [key: string]: any;
}
