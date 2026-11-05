// Integration scripts write test data. Supply credentials only for an isolated backend.
exports.load = () => {
  const password = process.env.SHIPYARD_TEST_PASSWORD
  if (!password) throw new Error('Set SHIPYARD_TEST_PASSWORD for the isolated integration-test accounts')
  return { password }
}

// Do not print request objects, command arguments or Playwright input traces.
exports.safeError = error => {
  if (Array.isArray(error)) return error.map(exports.safeError)
  let message = String(error?.message || error).split('\n')[0]
  const secret = process.env.SHIPYARD_TEST_PASSWORD
  if (secret) message = message.split(secret).join('[redacted]')
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
