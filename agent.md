# AI Agent Instructions

## Project Overview
This is a home automation monitoring project that collects data from:
- Resideo (Honeywell) thermostats via their API
- Philips Hue lights via their local API
- Sends collected data to Datadog for monitoring and visualization

## General Guidelines

### Code Quality
- Write clean, readable, and well-documented code
- Use proper error handling and logging
- Validate API responses before processing
- Handle edge cases and network failures gracefully

### Security
- Never commit API keys, secrets, or sensitive configuration to version control
- Use environment variables for all sensitive data (API keys, tokens, etc.)
- Validate and sanitize all external inputs
- Use secure communication protocols (HTTPS) for API calls

## Workflow
- Never commit to the main branch
- Always create a new branch from the main branch for each feature or bug fix
- Always create a pull request for each branch
- Always review the pull request
- Always follow the repository's commit message convention

This document should be updated as the project evolves and new requirements are identified.
