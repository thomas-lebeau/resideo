# Home Automation Monitor

A TypeScript-based home automation monitoring system with a plugin architecture that collects data from different sources and sends it as logs to [Datadog](https://www.datadoghq.com/). Metrics and dashboards are built from these logs with the Terraform configuration in [`terraform/`](terraform/).

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Collected Data](#collected-data)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Changelog](#changelog)

## Installation

### Quick Install (Recommended)

Install the latest release with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/main/scripts/install.sh | sudo bash
```

> **Security Note**: Always review installation scripts before running them. You can inspect the script at:
> https://github.com/thomas-lebeau/resideo/blob/main/scripts/install.sh

The installer will:

- Download and install the latest release binary to `/usr/local/bin`
- Install systemd service file to `/etc/systemd/system/`

**First-time installation:**
After running the installer, you need to:

1. Create your `.env` file with required configuration (see Configuration section below)
2. Edit the service file to configure your user and .env path:
   ```bash
   sudo nano /etc/systemd/system/raspberry-home-monitor.service
   ```
3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable raspberry-home-monitor
   sudo systemctl start raspberry-home-monitor
   ```

**Updates:**
When updating an existing installation, the service file is preserved. Just restart the service to apply the update:

```bash
sudo systemctl restart raspberry-home-monitor
```

The service runs continuously and collects data every minute automatically.

### Managing the Service

```bash
# View service status
sudo systemctl status raspberry-home-monitor

# View logs in real-time
sudo journalctl -u raspberry-home-monitor -f

# Stop/start/restart service
sudo systemctl stop raspberry-home-monitor
sudo systemctl start raspberry-home-monitor
sudo systemctl restart raspberry-home-monitor

# Disable auto-start on boot
sudo systemctl disable raspberry-home-monitor
```

### Customizing the Service

If you need to modify the service configuration after installation:

```bash
# Edit the service file
sudo nano /etc/systemd/system/raspberry-home-monitor.service

# Reload systemd and restart
sudo systemctl daemon-reload
sudo systemctl restart raspberry-home-monitor
```

## Configuration

Create a `.env` file with the following variables:

- `DD_API_KEY`: Your Datadog API key (required to send logs; not needed with `--dry-run` or for commands like `--help`, `--setup` or `--clear-store`)
- `DD_SITE`: Your Datadog site (defaults to `datadoghq.com`, use `datadoghq.eu` for EU)
- `ENV`: Environment name, sent as the `env` tag (defaults to `dev`)
- `LOG_LEVEL`: Console log level, as a syslog severity: `3` error, `4` warn, `6` info, `7` debug (defaults to `6`)

A plugin only runs when all of its environment variables are set. If one is missing, the plugin is reported once and skipped.

### Resideo Plugin

- `HW_API_KEY`: Your Resideo API key
- `HW_API_SECRET`: Your Resideo API secret
- `HW_DEVICE_ID`: Your thermostat device ID
- `HW_LOCATION_ID`: Your location ID
- `HW_USER_REF_ID`: Your user reference ID

### Philips Hue Plugin

- `HUE_HOST`: IP address of your Hue bridge (e.g., `192.168.1.100`)
- `HUE_USERNAME`: Your Hue API username/key

### Philips TV Plugin

- `PHILIPS_TV_HOST`: IP address of your Philips Android TV (e.g., `192.168.1.101`)
- `PHILIPS_TV_DEVICE_ID`: Device ID obtained during pairing
- `PHILIPS_TV_AUTH_KEY`: Authentication key obtained during pairing

To get these credentials, you need to pair with your TV first. See the "Philips TV Pairing" section below.

### Plex Media Center Plugin

- `PLEX_HOST`: Your Plex server host
- `PLEX_TOKEN`: Your Plex API token

### Speed Test Plugin

- `FAST_SPEEDTEST_TOKEN`: Your Fast SpeedTest token

### Balay Dishwasher Plugin

- `BALAY_CLIENT_ID`: Your Home Connect API client ID

To get these credentials:

1. Register as a developer at [Home Connect Developer Portal](https://developer.home-connect.com/)
2. Create an application (the redirect URI is not required for device flow)
3. Connect your Balay dishwasher to the Home Connect app on your phone
4. Add the client ID to your `.env` file as `BALAY_CLIENT_ID`

**Authentication**: The plugin uses OAuth 2.0 device flow authentication. Run `raspberry-home-monitor --setup --plugin balay-dishwasher` once; it will:

- Display a URL and code for you to authorize the application
- Wait for you to complete the authorization in your browser
- Automatically save and manage the access tokens
- Refresh tokens automatically when they expire

Tokens are stored in the plugin store, a JSON file in the OS config directory managed by [`conf`](https://github.com/sindresorhus/conf) (e.g. `~/.config/raspberry-home-monitor-nodejs/config.json` on Linux), and are refreshed automatically. You don't need to manually manage refresh tokens.

### ThermoBeacon Plugin

- `THERMOBEACON_DEVICES`: JSON object mapping MAC addresses to device names

Example configuration:

```json
THERMOBEACON_DEVICES={"8e:bb:00:00:05:77":"Living Room","ab:cd:ef:12:34:56":"Bedroom"}
```

The plugin will scan for ThermoBeacon WS08 temperature and humidity sensors via Bluetooth and report data only for devices configured in this environment variable.

### Huawei Router Plugin

- `HUAWEI_ROUTER_HOST`: IP address of your Huawei router (e.g., `192.168.1.1`)
- `HUAWEI_ROUTER_USERNAME`: Router admin username
- `HUAWEI_ROUTER_PASSWORD`: Router admin password

### Transmission Plugin

- `TRANSMISSION_HOST`: Transmission server host and port, without the protocol (e.g., `192.168.1.100:9091`)
- `TRANSMISSION_USERNAME`: Transmission RPC username
- `TRANSMISSION_PASSWORD`: Transmission RPC password

### DHT22 Plugin

- `DHT22_SENSORS`: JSON object mapping GPIO pin numbers to sensor names

Example configuration:

```json
DHT22_SENSORS={"4":"Server Room","17":"Living Room"}
```

The plugin will read temperature and humidity from each configured DHT22 sensor on the specified GPIO pins.

**Note**: The DHT22 plugin requires the `node-dht-sensor` package and appropriate GPIO permissions. On Linux, you may need to run with sudo or configure GPIO permissions.

### Philips TV Pairing

Before using the Philips TV plugin, you need to pair with your TV to obtain the device ID and authentication key:

1. Make sure your TV is on and connected to the same network
2. Run the pairing script:
   ```bash
   node scripts/pair-philips-tv.mjs --host 192.168.1.101
   ```
3. A PIN code will be displayed on your TV screen
4. Enter the PIN code when prompted
5. The script will display your `PHILIPS_TV_DEVICE_ID` and `PHILIPS_TV_AUTH_KEY`
6. Add these to your `.env` file along with the `PHILIPS_TV_HOST`

## How It Works

The application uses a plugin-based architecture:

1. **Plugin Registry**: Loads the plugins listed in `src/plugins/index.mts`
2. **Data Collection**: Each plugin collects data from its respective source (APIs, local devices, etc.)
3. **Data Transformation**: Plugins return data in a standardized format
4. **Log Submission**: The main application sends the collected data to Datadog as logs
5. **Scheduling**: Runs continuously as a systemd service, running each plugin every minute (or every `interval` minutes, e.g. 10 for the speed test)

Each plugin runs independently, so if one fails, others continue to operate normally.

## Usage

The service runs continuously in the background, collecting data every minute. To run manually for testing:

```bash
raspberry-home-monitor --env ~/.path/to/.env
```

### Command-Line Options

- `--env` `-e`: Specify an environment file (default: `.env`). Can be specified multiple times. Example: `raspberry-home-monitor --env ~/.path/to/.env`
- `--plugin` `-p`: Run specific plugin(s) (default: `all`). Can be specified multiple times. Example: `raspberry-home-monitor --plugin resideo --plugin philips-hue`
- `--list-plugins` `-l`: List available plugins
- `--no-plugin` `-x`: Exclude specific plugin(s). Can be specified multiple times. Example: `raspberry-home-monitor --no-plugin fast-speed-test`. Applied after `--plugin`, so a plugin passed to both is excluded.
- `--dry-run` `-d`: Run in dry-run mode (no data will be sent to Datadog)
- `--update` `-u`: Update the application
- `--setup` `-s`: Setup the plugins authentication tokens
- `--clear-store` `-S`: Clear the plugin store (stored authentication tokens, etc.)
- `--help` `-h`: Display help information
- `--version` `-v`: Display version information

## Collected Data

| Plugin                | Description               | Data Collected                         |
| --------------------- | ------------------------- | -------------------------------------- |
| **Resideo/Honeywell** | Monitor thermostat data   | Temperature, humidity, system status   |
| **Philips Hue**       | Track smart lighting      | Light status, brightness, color        |
| **Philips TV**        | Monitor Android TV        | Power state, current source, volume    |
| **Plex Media Server** | Track media playback      | Active streams, library stats          |
| **ThermoBeacon**      | BLE temperature sensors   | Temperature, humidity, battery         |
| **DHT22**             | GPIO temperature sensor   | Temperature, humidity                  |
| **Balay Dishwasher**  | Home Connect appliances   | Program status, remaining time         |
| **Fast SpeedTest**    | Internet speed monitoring | Download/upload speeds, latency        |
| **Huawei Router**     | Router statistics         | Connection status, bandwidth usage     |
| **Transmission**      | BitTorrent client         | Active torrents, download/upload rates |

## Development

### Manual Installation (Development)

Development needs Node.js `^22.18.0 || >=23.6.0` (the `engines` field), so the `.mts` sources run with Node's built-in type stripping. The pinned version is in `.nvmrc` (and `volta` in `package.json`): run `nvm use` or let Volta pick it up. The release binary is different: `npm run build` bundles for Node 18, and the armv7/arm64 releases are built on Node 18.

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd resideo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your actual API credentials
   ```

TypeScript files (.mts) run natively with Node.js type stripping - no compilation needed for local development

```bash
npm run dev
```

### Creating New Plugins

The plugin system uses a class-based architecture with `AbstractPlugin` as the base class. Follow these steps to create a new plugin:

#### 1. Create Plugin File

Create a new `.mts` file in `src/plugins/` with a descriptive name (e.g., `my-smart-device.mts`), and add the class to the `plugins` array in `src/plugins/index.mts`.

#### 2. Implement the Plugin Class

Extend the `AbstractPlugin` class and implement the required methods:

```typescript
import { AbstractPlugin, type Other } from "../shared/AbstractPlugin.mts";

// Required environment variables. The plugin is skipped if one is missing.
const CONFIG = ["MY_DEVICE_API_KEY", "MY_DEVICE_HOST"] as const;

export class MySmartDevice extends AbstractPlugin<Other, typeof CONFIG> {
  static readonly description = "Monitor my smart device";

  constructor() {
    super(CONFIG);
  }

  async run(): Promise<Other | undefined> {
    try {
      // Access configuration from this.config
      const { MY_DEVICE_API_KEY, MY_DEVICE_HOST } = this.config;

      // Fetch data from your source
      const response = await fetch(`${MY_DEVICE_HOST}/api/status`, {
        headers: { "Authorization": `Bearer ${MY_DEVICE_API_KEY}` }
      });

      const data = await response.json();

      // Return data in the standardized format
      return {
        type: "my-device",
        name: "Living Room Device",
        state: data.online ? 1 : 0,
        temperature: data.temperature,
        battery_level: data.battery,
      };
    } catch (error) {
      this.logger.error(error as Error);
      return undefined;
    }
  }
}
```

#### 3. Plugin Types

The plugin system supports four predefined types with standardized schemas:

**Thermometer** - For temperature/humidity sensors:

```typescript
import { AbstractPlugin, type Thermometer } from "../shared/AbstractPlugin.mts";

export class MyThermometer extends AbstractPlugin<Thermometer> {
  async run(): Promise<Thermometer | undefined> {
    return {
      type: "thermometer",
      name: "Living Room",
      temperature: 22.5,      // °C
      humidity: 45,           // %
      battery_level: 85,      // %
    };
  }
}
```

**Thermostat** - For heating/cooling devices:

```typescript
return {
  type: "thermostat",
  name: "Main Thermostat",
  state: 1,              // 0 = off, 1 = on
  operation_mode: 1,     // 0 = equipment off, 1 = heating
  target: 21,            // Target temperature in °C
};
```

**Light** - For smart lighting:

```typescript
return {
  type: "light",
  name: "Bedroom Light",
  state: 1,              // 0 = off, 1 = on
  brightness: 75,        // 0-100
};
```

**Other** - For custom devices (flexible schema):

```typescript
return {
  type: "custom-device",
  name: "My Device",
  state: 1,              // Optional
  mode: 0,               // Optional
  // Add any custom properties
  customProperty: "value",
};
```

#### 4. Returning Multiple Devices

If your plugin monitors multiple devices, return an array:

```typescript
async run(): Promise<Array<Thermometer> | undefined> {
  return [
    { type: "thermometer", name: "Living Room", temperature: 22.5, humidity: 45 },
    { type: "thermometer", name: "Bedroom", temperature: 20.0, humidity: 50 },
    { type: "thermometer", name: "Kitchen", temperature: 23.0, humidity: 42 },
  ];
}
```

#### 5. Optional Setup Method

Implement the `setup()` method for one-time initialization (OAuth, pairing, etc.). Each plugin has its own persistent store (`this.store`) for data like OAuth tokens. It holds a single object per plugin: `set(value)` replaces it, `get()` returns it (or `undefined`), and `clear()` removes it. These methods are synchronous. Declare the shape of the stored object with the third type parameter of `AbstractPlugin`.

```typescript
type Tokens = { access_token: string; expires_at: number };

export class MySmartDevice extends AbstractPlugin<Other, typeof CONFIG, Tokens> {
  constructor() {
    super(CONFIG);
  }

  async setup(): Promise<void> {
    this.logger.info("Starting setup...");

    // Perform OAuth flow, device pairing, etc.
    const tokens = await this.performOAuthFlow();
    this.store.set(tokens);

    this.logger.info("Setup complete!");
  }

  async run(): Promise<Other | undefined> {
    // Retrieve stored tokens
    const tokens = this.store.get();

    if (!tokens) {
      this.logger.warn("No access token found, run --setup first");
      return undefined;
    }

    // Use the token
    const data = await this.fetchData(tokens.access_token);
    return { type: "my-device", name: "Device", state: data.state };
  }
}
```

Users can run your setup with: `raspberry-home-monitor --setup --plugin my-smart-device`

#### 6. Plugin Naming Conventions

- **Class names**: Use PascalCase (e.g., `MySmartDevice`)
- **File names**: Use kebab-case (e.g., `my-smart-device.mts`)
- **Plugin slug**: Automatically generated from class name (e.g., `MySmartDevice` → `my-smart-device`)
- **Type names**: Use lowercase with hyphens (e.g., `"my-device"`)

#### 7. Logging

Use the built-in logger for consistent output:

```typescript
this.logger.info("Collecting data...");
this.logger.warn("Rate limit approaching", { remaining: 10 });
this.logger.error(error); // takes an Error, sent to Datadog with its stack trace
this.logger.debug("Raw API response", { data });
```

`warn` and `error` are also sent to Datadog. `debug` is only shown with `LOG_LEVEL=7` (set it in `.env`).

#### 8. Testing Your Plugin

Test your plugin locally before deploying:

```bash
# Run only your plugin in dry-run mode
npm run dev -- --plugin my-smart-device --dry-run

# Run setup if needed
npm run dev -- --setup --plugin my-smart-device

# Run with debug logging (set LOG_LEVEL=7 in your .env first)
npm run dev -- --plugin my-smart-device
```

Values from the `.env` file override variables set in the shell, so `LOG_LEVEL=7 npm run dev` has no effect if `.env` already sets `LOG_LEVEL`.

#### 9. Environment Variables

Add any required environment variables to your `.env` file and document them in this README under the Configuration section.

#### 10. Export Requirements

Export the class as a named export, add it to the `plugins` array in `src/plugins/index.mts`, and add a static `description` property for the plugin listing:

```typescript
export class MySmartDevice extends AbstractPlugin<Other, typeof CONFIG> {
  static readonly description = "Monitor my smart device status";
  // ... rest of implementation
}
```

Once registered in `src/plugins/index.mts`, your plugin is executed when the application runs. The system handles error catching, logging, and data forwarding to Datadog.

## Troubleshooting

### Common Issues

#### Bluetooth Permission Errors (Linux)

**Problem**: `Error: Cannot start scanning, state is unsupported` when using Bluetooth plugins (ThermoBeacon, etc.)

**Solution**: The systemd service file already includes the necessary Bluetooth capabilities (`CAP_NET_RAW` and `CAP_NET_ADMIN`). If you're still experiencing issues:

1. Make sure you're using the latest service file:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/main/scripts/raspberry-home-monitor.service -o /tmp/raspberry-home-monitor.service
   sudo cp /tmp/raspberry-home-monitor.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl restart raspberry-home-monitor
   ```

2. If running manually (not as a service), grant Node.js the required capabilities:
   ```bash
   sudo setcap cap_net_raw+eip $(readlink -f $(which node))
   ```

#### Plugin Authentication Failures

**Problem**: OAuth plugins (e.g. Balay) fail with authentication errors

**Solution**:

1. Remove stored tokens: `raspberry-home-monitor --clear-store --plugin balay-dishwasher`
2. Run setup: `raspberry-home-monitor --setup --plugin balay-dishwasher`
3. Follow the authentication prompts

## Contributing

Contributions are welcome. Before opening a pull request:

1. Run `npm run lint` and `npm test`
2. Use `<type>: <description>` commit messages (e.g., `fix: handle missing sensor data`), one logical change per commit
3. Document any new environment variable in the [Configuration](#configuration) section

See [AGENTS.md](AGENTS.md) for development conventions and an overview of the architecture (including the Logger ↔ Datadog circular import).

## Changelog

Release notes are published on [GitHub Releases](https://github.com/thomas-lebeau/resideo/releases).

## License

MIT License - see LICENSE file for details.
