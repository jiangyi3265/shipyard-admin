// Match the backend's two-decimal inputs without rounding a binary floating-point product.
// At the supported rate/hour limits all intermediate integers remain below 2^53.
function hundredths(value) {
  const text = String(value ?? '').trim()
  if (!text || text.length > 64) return null
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return null
  const fraction = match[2] ?? match[3] ?? ''
  const scale = fraction.length - Number(match[4] || 0)
  if (!Number.isInteger(scale) || scale > 2) return null
  const digits = ((match[1] || '') + fraction).replace(/^0+/, '') || '0'
  if (digits === '0') return 0
  const zeros = 2 - scale
  if (zeros > 11 || digits.length + zeros > 11) return null
  const amount = Number(digits + '0'.repeat(zeros))
  return amount <= 99999999999 ? amount : null
}

// Invalid/unfinished form inputs contribute zero; the server still validates submissions.
export function hourlyWageCents(rate, hours) {
  const rateUnits = hundredths(rate), hourUnits = hundredths(hours)
  if (rateUnits === null || hourUnits === null || hourUnits > 2400) return 0
  return Math.floor((rateUnits * hourUnits + 50) / 100)
}

export function sumHourlyWages(rows) {
  return rows.reduce((cents, row) => cents + hourlyWageCents(row.rate, row.hours), 0) / 100
}
