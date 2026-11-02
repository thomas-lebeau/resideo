#!/usr/bin/env node

/**
 * Philips TV Pairing Script
 *
 * This script helps you pair with your Philips Android TV to obtain
 * the device ID and authentication key needed for the monitoring plugin.
 *
 * Usage:
 *   node scripts/pair-philips-tv.mjs --host 192.168.1.101
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Agent } from "undici";

// Shared key used to sign the pairing grant request (Philips JointSpace API v6).
// This is not a secret of this project: it is a public, well-known key that is
// the same for every Philips TV client and ships in open-source clients such as
// pylips and ha-philipsjs. The per-device credentials (device ID and auth key)
// are what must be kept private, and they are never stored in this script.
const SECRET_KEY =
  "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==";

// Agent that accepts self-signed certificates
const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

function generateDeviceId() {
  return randomBytes(8).toString("hex");
}

function createSignature(secretKey, toSign) {
  const hmac = createHmac("sha1", Buffer.from(secretKey, "base64"))
    .update(toSign)
    .digest("hex");

  // The TV expects the base64 encoding of the hex digest string, not of the
  // raw digest bytes.
  return Buffer.from(hmac).toString("base64");
}

function getDeviceSpec(config) {
  return {
    device_name: "home-monitor",
    device_os: "Linux",
    app_name: "Home Monitor",
    type: "native",
    app_id: config.applicationId,
    id: config.deviceId,
  };
}

async function promptForInput(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function pair(host) {
  const config = {
    address: host,
    applicationId: "app.id",
    deviceId: generateDeviceId(),
  };

  console.log(`\n🔗 Starting pairing request to ${host}...`);

  try {
    // Step 1: Send pairing request
    const pairResponse = await fetch(`https://${host}:1926/6/pair/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: ["read", "write", "control"],
        device: getDeviceSpec(config),
      }),
      dispatcher: agent,
    });

    if (!pairResponse.ok) {
      throw new Error(`Pairing request failed: ${pairResponse.status}`);
    }

    const pairData = await pairResponse.json();
    const authTimestamp = pairData.timestamp;
    const authKey = pairData.auth_key;

    console.log("\n✅ Pairing request successful!");
    console.log("📺 Please check your TV screen for a PIN code\n");

    // Step 2: Get PIN from user
    const pin = await promptForInput("Enter the PIN code shown on your TV: ");

    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new Error("Invalid PIN. Please enter a 4-digit PIN code.");
    }

    console.log("\n🔐 Authenticating with PIN...");

    // Step 3: Create authentication signature
    const toSign = Buffer.concat([
      Buffer.from(String(authTimestamp)),
      Buffer.from(pin),
    ]);
    const signature = createSignature(SECRET_KEY, toSign);

    const auth = {
      auth_AppId: "1",
      pin: pin,
      auth_timestamp: authTimestamp,
      auth_signature: signature,
    };

    const grantRequest = {
      auth: auth,
      device: getDeviceSpec(config),
    };

    // Step 4: Send grant request with digest auth
    const username = config.deviceId;
    const password = authKey;

    // First request to get the digest challenge
    const challengeResponse = await fetch(`https://${host}:1926/6/pair/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(grantRequest),
      dispatcher: agent,
    });

    if (challengeResponse.status !== 401) {
      throw new Error(
        `Expected 401 challenge, got ${challengeResponse.status}`
      );
    }

    // Parse the WWW-Authenticate header for digest auth
    const wwwAuth = challengeResponse.headers.get("www-authenticate");
    if (!wwwAuth) {
      throw new Error("No WWW-Authenticate header found");
    }

    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";

    // Calculate digest auth response
    const path = "/6/pair/grant";
    const nc = "00000001";
    const cnonce = randomBytes(8).toString("hex");

    const ha1 = createHash("md5")
      .update(`${username}:${realm}:${password}`)
      .digest("hex");

    const ha2 = createHash("md5").update(`POST:${path}`).digest("hex");

    const response = createHash("md5")
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      .digest("hex");

    const authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${path}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

    // Retry with digest authentication
    const grantResponse = await fetch(`https://${host}:1926/6/pair/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(grantRequest),
      dispatcher: agent,
    });

    if (!grantResponse.ok) {
      const errorText = await grantResponse.text();
      throw new Error(
        `Grant request failed: ${grantResponse.status}\n${errorText}`
      );
    }

    await grantResponse.json();
    console.log("\n✅ Pairing successful!\n");
    console.log("📋 Add these credentials to your .env file:\n");
    console.log(`PHILIPS_TV_HOST=${host}`);
    console.log(`PHILIPS_TV_DEVICE_ID=${username}`);
    console.log(`PHILIPS_TV_AUTH_KEY=${password}`);
    console.log("");
  } catch (error) {
    console.error("\n❌ Pairing failed:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const hostIndex = args.indexOf("--host");

if (hostIndex === -1 || !args[hostIndex + 1]) {
  console.error(
    "Usage: node scripts/pair-philips-tv.mjs --host <TV_IP_ADDRESS>"
  );
  console.error(
    "Example: node scripts/pair-philips-tv.mjs --host 192.168.1.101"
  );
  process.exit(1);
}

const host = args[hostIndex + 1];

pair(host);
