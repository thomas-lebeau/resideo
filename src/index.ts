#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { collectThermostatData } from './resideo.ts';
import { collectHueLightData } from './hue.ts';

/**
 * Main monitoring function that collects data from all sources
 */
async function runMonitoring(): Promise<void> {
  const startTime = performance.now();
  console.log('🏠 Starting home automation monitoring...');
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  
  const promises = [];

  try {
    // Run both data collection operations in parallel
    promises.push(
      collectThermostatData().catch(error => {
        console.error('❌ Thermostat data collection failed:', error.message);
        return Promise.resolve(); // Don't fail the whole operation
      })
    );

    promises.push(
      collectHueLightData().catch(error => {
        console.error('❌ Hue light data collection failed:', error.message);
        return Promise.resolve(); // Don't fail the whole operation
      })
    );

    await Promise.all(promises);

    const duration = performance.now() - startTime;
    console.log(`✅ Monitoring completed successfully in ${duration.toFixed(2)}ms`);

  } catch (error) {
    console.error('❌ Monitoring failed:', error);
    process.exit(1);
  }
}

/**
 * Displays help information
 */
function showHelp(): void {
  console.log(`
Usage: npm run dev [options] [command]

Commands:
  all      Run both thermostat and Hue monitoring (default)
  resideo  Run only thermostat monitoring  
  hue      Run only Hue light monitoring

Options:
  --help, -h    Show this help message

Examples:
  npm run dev           # Run all monitoring
  npm run dev all       # Run all monitoring  
  npm run dev resideo   # Run only thermostat
  npm run dev hue       # Run only Hue lights
  npm run dev --help    # Show this help
  `);
}

/**
 * CLI interface using Node.js parseArgs API
 */
async function main(): Promise<void> {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        help: {
          type: 'boolean',
          short: 'h',
        },
      },
      allowPositionals: true,
    });

    if (values.help) {
      showHelp();
      return;
    }

    const command = positionals[0] || 'all';

    switch (command) {
      case 'resideo':
        await collectThermostatData();
        break;
      
      case 'hue':
        await collectHueLightData();
        break;
      
      case 'all':
        await runMonitoring();
        break;
      
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run main function when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}