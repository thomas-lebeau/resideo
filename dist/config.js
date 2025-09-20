"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv = __importStar(require("dotenv"));
// Load environment variables from .env file
dotenv.config();
/**
 * Validates that all required environment variables are present
 */
function validateConfig() {
    const requiredVars = [
        'API_KEY',
        'API_SECRET',
        'DEVICE_ID',
        'LOCATION_ID',
        'USER_REF_ID',
        'HUE_HOST',
        'HUE_USERNAME',
        'DD_API_KEY'
    ];
    const missing = requiredVars.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    return {
        API_KEY: process.env.API_KEY,
        API_SECRET: process.env.API_SECRET,
        DEVICE_ID: process.env.DEVICE_ID,
        LOCATION_ID: process.env.LOCATION_ID,
        USER_REF_ID: process.env.USER_REF_ID,
        HUE_HOST: process.env.HUE_HOST,
        HUE_USERNAME: process.env.HUE_USERNAME,
        DD_API_KEY: process.env.DD_API_KEY,
    };
}
/**
 * Configuration object with all environment variables
 */
exports.config = validateConfig();
//# sourceMappingURL=config.js.map