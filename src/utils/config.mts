import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

export const config = {
  DD_API_KEY: process.env.DD_API_KEY,
  ENV: process.env.ENV || "dev",

  DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",
};
