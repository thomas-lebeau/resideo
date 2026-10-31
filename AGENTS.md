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

6. **Commit Messages**: Keep commit messages concise and one-liner if possible. Use the format: `<type>: <description>` (e.g., `fix: resolve build error in armv7 workflow`). Don't mix unrelated changes in a single commit - create separate commits for each logical change.

## Architecture

- **Entry point**: `src/main.mts` parses args, then every minute runs each enabled plugin (`src/plugins/index.mts` is the registry) and sends its result to Datadog as a log. Plugins with `static interval = n` run every `n` minutes.
- **Plugins** extend `AbstractPlugin` (`src/shared/AbstractPlugin.mts`), which provides `this.config` (required env vars), `this.logger` and `this.store` (per-plugin key-value store persisted with `conf`).
- **Datadog** (`src/utils/Datadog.mts`) is a singleton queue of logs. `send()` only enqueues; `flush()` (called once per cycle and on shutdown) chunks the queue to fit intake limits, requeues on network/retryable errors and drops oldest entries when the queue is full.
- **Logger** (`src/utils/Loggers.mts`) writes to the console and forwards `warn`/`error` to the Datadog queue.

### Logger ↔ Datadog circular import

`Loggers.mts` imports the `Datadog` singleton, and `Datadog.mts` imports the `Logger` class to create its own logger. This cycle is intentional, with two rules to keep it working:

1. **`Datadog.mts` must be evaluated first.** It calls `new Logger(...)` at module top level, so if `Loggers.mts` is imported first, `Logger` is still uninitialized and the import throws `ReferenceError: Cannot access 'Logger' before initialization`. This is why `src/main.mts` imports `./utils/Datadog.mts` before anything else, and why `npm test` runs with `--import ./src/utils/Datadog.mts`. Keep that import first; `Loggers.mts` only uses `datadog` inside `log()`, so it is fine in that order.
2. **Datadog's own logger never forwards to Datadog.** It is created with `Logger.LOG_LEVELS.emerg` as its Datadog level, so a failed flush can't enqueue more logs about itself (infinite loop / ever-growing queue). Don't log through the default logger from inside `Datadog.mts`.

## Releases

Releases are cut by the `release` GitHub workflow, which bumps the version, tags it and publishes the release notes and binaries. There is no `CHANGELOG.md`: see [GitHub Releases](https://github.com/thomas-lebeau/resideo/releases) for the changelog.
