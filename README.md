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

TypeScript files (.mts) run natively with Node.js type stripping - no compilation needed!

## Configuration

Create a `.env` file with the following variables:

### Datadog
- `DD_API_KEY`: Your Datadog API key

### [optional] Resideo/Honeywell Plugin
- `HW_API_KEY`: Your Resideo API key
- `HW_API_SECRET`: Your Resideo API secret
- `HW_DEVICE_ID`: Your thermostat device ID
- `HW_LOCATION_ID`: Your location ID
- `HW_USER_REF_ID`: Your user reference ID

### [optional] Philips Hue Plugin
- `HUE_HOST`: IP address of your Hue bridge (e.g., `192.168.1.100`)
- `HUE_USERNAME`: Your Hue API username/key

### Optional
- `ENV`: Environment name (defaults to "dev")
- `DEBUG`: Set to "true" or "1" to enable console logging

## Usage

### Run the application
```bash
node src/main.mts
```
Runs all monitoring plugins automatically. The system discovers and executes all plugins in the `src/plugins/` directory.


## Development

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
