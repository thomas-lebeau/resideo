#!/usr/bin/env ts-node

import { collectThermostatData } from './resideo';
import { collectHueLightData } from './hue';

/**
 * Main monitoring function that collects data from all sources
 */
async function runMonitoring(): Promise<void> {
  const startTime = Date.now();
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

    const duration = Date.now() - startTime;
    console.log(`✅ Monitoring completed successfully in ${duration}ms`);

  } catch (error) {
    console.error('❌ Monitoring failed:', error);
    process.exit(1);
  }
}

/**
 * CLI interface - supports running specific scripts or all
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'resideo':
        await collectThermostatData();
        break;
      
      case 'hue':
        await collectHueLightData();
        break;
      
      case undefined:
      case 'all':
        await runMonitoring();
        break;
      
      default:
        console.log(`
Usage: npm run dev [command]

Commands:
  all      Run both thermostat and Hue monitoring (default)
  resideo  Run only thermostat monitoring  
  hue      Run only Hue light monitoring

Examples:
  npm run dev           # Run all monitoring
  npm run dev all       # Run all monitoring  
  npm run dev resideo   # Run only thermostat
  npm run dev hue       # Run only Hue lights
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run main function when executed directly
if (require.main === module) {
  main();
}