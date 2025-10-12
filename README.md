# Home Automation Monitor

A TypeScript-based home automation monitoring system with a plugin architecture that collects data from different sources and sends the data to Datadog for monitoring and visualization.

## Prerequisites

- Node.js 24.8+ (for experimental TypeScript support and modern APIs)
- npm or yarn
- Datadog account and API key
- [optional] Resideo/Honeywell developer account and API credentials
- [optional] Philips Hue bridge with API access
- 

## Installation

### Quick Install (Recommended)

Install the latest release with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/main/scripts/install.sh | bash
```

This will:
- Download the latest release binary
- Install it to `/usr/local/bin` or `~/.local/bin`

## Configuration

Create a `.env` file with the following variables:

- `DD_API_KEY`: Your Datadog API key
- `DD_HOST`: Your Datadog host (defaults to "https://api.datadoghq.eu")
- `ENV`: Environment name (defaults to "development")
- `DEBUG`: Set to "true" or "1" to enable console logging (defaults to "false")

### Resideo Plugin
- `HW_API_KEY`: Your Resideo API key
- `HW_API_SECRET`: Your Resideo API secret
- `HW_DEVICE_ID`: Your thermostat device ID
- `HW_LOCATION_ID`: Your location ID
- `HW_USER_REF_ID`: Your user reference ID

### Philips Hue Plugin
- `HUE_HOST`: IP address of your Hue bridge (e.g., `192.168.1.100`)
- `HUE_USERNAME`: Your Hue API username/key
- `HUE_API_KEY`: Your Hue API key
- 
### Plex Media Center Plugin
- `PLEX_HOST`: Your Plex server host
- `PLEX_TOKEN`: Your Plex API token

### Speed Test Plugin
- `FAST_SPEEDTEST_TOKEN`: Your Fast SpeedTest token

## Usage

### Run the application
```bash
raspberry-home-monitor --env ~/.path/to/.env
```

### Options

- `--env` `-e`: Specify an environment file (e.g., `raspberry-home-monitor --env ~/.path/to/.env`)
- `--plugin` `-p`: Run a specific plugin (e.g., `raspberry-home-monitor --plugin resideo`). Available plugins: `resideo`, `philips-hue`, `plex-media-server`, `fast-speedtest`


## Development

### Manual Installation (Development)

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

To create a new monitoring plugin:

1. Create a new `.mts` file in `src/plugins/`
2. Export a default function that returns data to be sent to Datadog:
   ```typescript
   export default async function collectMyData(): Promise<Record<string, any> | void> {
     // Your data collection logic here
     return { key: "value" };
   }
   ```
3. The plugin will be automatically discovered and executed

The plugin system uses the `Plugin` utility class which handles error logging and data forwarding to Datadog.

## License

MIT License - see LICENSE file for details.
