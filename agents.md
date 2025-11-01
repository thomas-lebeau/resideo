# Agent Instructions

## Development Workflow

1. **Testing Changes Locally**: Run specific plugins during development using `npm run dev -- --plugin <plugin-name>` (e.g., `npm run dev -- --plugin resideo`). This isolates testing to the plugin being modified.

2. **Logging Levels**: Use the logger appropriately:
   - `logger.debug()`: Detailed diagnostic info for development/troubleshooting (visible when `LOG_LEVEL=7`)
   - `logger.info()`: General informational messages about normal operations
   - `logger.warn()`: Warning messages for recoverable issues (always sent to Datadog)
   - `logger.error()`: Error objects only - sends full stack trace to Datadog

3. **Debugging Feedback Loop**: When debugging:
   - Add `logger.debug()` calls with relevant state/data
   - Remove debug logs before committing, or keep only essential ones

4. **File Extensions**: All TypeScript files use `.mts` extension (ES modules). Node.js runs them natively without compilation.

5. **Code Quality**: Run `npm run lint` after changes to catch issues before committing.
