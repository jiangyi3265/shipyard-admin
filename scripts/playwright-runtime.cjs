// Install Playwright locally for UI checks, or point to an existing installation.
module.exports = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
