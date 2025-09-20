# Home Automation Monitor

A TypeScript-based home automation monitoring system that collects data from Resideo (Honeywell) thermostats and Philips Hue lights, then sends the data to Datadog for monitoring and visualization.

## Features

- 🌡️ **Thermostat Monitoring**: Collects temperature and mode data from Resideo/Honeywell thermostats
- 💡 **Smart Light Monitoring**: Tracks status and brightness of Philips Hue lights  
- 📊 **Datadog Integration**: Sends all collected data to Datadog for dashboards and alerts
- 🔒 **Secure**: Uses environment variables for all API keys and sensitive data
- 🚀 **TypeScript**: Full type safety with comprehensive error handling
- ⚡ **Concurrent**: Runs data collection from multiple sources in parallel
- 🌐 **Native Fetch**: Uses Node.js native fetch API (no external HTTP dependencies)
- 🔧 **Modern Node.js**: Uses native APIs like parseArgs, performance.now(), and node: imports

## Prerequisites

- Node.js 22.6+ (for modern APIs and TypeScript compilation)
- npm or yarn
- Resideo/Honeywell developer account and API credentials
- Philips Hue bridge with API access
- Datadog account and API key

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd resideo-home-monitor
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

The TypeScript code compiles to JavaScript and runs with Node.js.

## Configuration

Create a `.env` file with the following variables:

### Resideo/Honeywell API
- `HW_API_KEY`: Your Resideo API key
- `HW_API_SECRET`: Your Resideo API secret
- `HW_DEVICE_ID`: Your thermostat device ID
- `HW_LOCATION_ID`: Your location ID
- `HW_USER_REF_ID`: Your user reference ID

### Philips Hue Bridge
- `HUE_HOST`: IP address of your Hue bridge (e.g., `192.168.1.100`)
- `HUE_USERNAME`: Your Hue API username/key

### Datadog
- `DD_API_KEY`: Your Datadog API key

## Usage

### Run All Monitoring (Default)
```bash
npm run dev
# or
npm run dev all
```

### Run Individual Components
```bash
# Only thermostat monitoring
npm run dev resideo

# Only Hue light monitoring  
npm run dev hue
```

### Production
```bash
# Run all monitoring
npm start

# Or run specific components
npm run resideo
npm run hue
```

## API Documentation

### Resideo/Honeywell APIs Used
- **OAuth Token Endpoint**: `POST https://api.honeywell.com/oauth2/accesstoken`
- **Thermostat Data**: `GET https://api.honeywell.com/v2/devices/thermostats/{deviceId}`

### Philips Hue APIs Used  
- **Light Status**: `GET https://{bridge-ip}/clip/v2/resource/light`

### Datadog Integration
- **Log Ingestion**: `POST https://http-intake.logs.datadoghq.eu/api/v2/logs`

## Data Schema

### Thermostat Data
```typescript
{
  mode: string,              // Heating mode (e.g., "Heat", "Cool", "Off")
  heatSetpoint: number,      // Target temperature
  operationMode: string,     // Current operation status
  outdoorTemperature: number, // External temperature
  indoorTemperature: number  // Internal temperature
}
```

### Light Data
```typescript
{
  [lightName: string]: {
    status: boolean,    // On/off status
    brightness: number  // Brightness level (0-100)
  }
}
```

## Development

### Project Structure
```
src/
├── index.ts      # Main entry point with CLI
├── resideo.ts    # Thermostat data collection
├── hue.ts        # Hue light data collection  
├── datadog.ts    # Datadog integration
├── config.ts     # Environment variable handling
└── types.ts      # TypeScript interfaces
```

### Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Build and run in development mode
- `npm start` - Build and run in production mode
- `npm run resideo` - Run only thermostat monitoring
- `npm run hue` - Run only Hue light monitoring

All scripts automatically compile TypeScript before running.

## Utilities

The repository includes some utility HTML files:

- **resideo.html**: OAuth helper for obtaining Resideo API credentials
- **index.html**: Quick redirect to your Datadog dashboard

## Security Notes

- Never commit `.env` files or API keys to version control
- The Hue API uses self-signed certificates; the code handles this appropriately
- All API communication uses HTTPS
- Environment variables are validated at startup

## Contributing

1. Create a feature branch from main
2. Make your changes with proper TypeScript types
3. Test thoroughly with your own APIs
4. Submit a pull request

## License

MIT License - see LICENSE file for details.