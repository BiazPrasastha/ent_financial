export function toInt(amount: string | null | undefined): number {
  if (!amount) return 0
  const clean = amount.replace(/[^0-9.-]/g, '')
  const negative = clean.startsWith('-')
  const abs = clean.replace('-', '')
  const [whole = '0', dec = ''] = abs.split('.')
  const val =
    parseInt(whole, 10) * 10000 +
    parseInt(dec.padEnd(4, '0').slice(0, 4), 10)
  return negative ? -val : val
}

export function fromInt(n: number): string {
  const negative = n < 0
  const abs = Math.abs(n)
  const s = String(abs).padStart(5, '0')
  const result = s.slice(0, -4) + '.' + s.slice(-4)
  return negative ? '-' + result : result
}

export function calcFee(amount: string): string {
  const cents = toInt(amount)
  const fee = Math.round(cents * 3) / 100
  return fromInt(fee)
}

export function calcNet(amount: string): string {
  const fee = toInt(calcFee(amount))
  return fromInt(toInt(amount) - fee)
}

export function formatAmount(amount: string | null | undefined): string {
  if (!amount) return '\u2014'
  return '$' + amount
}

export function computeRunningBalances(
  entries: Array<{ debit: string | null; credit: string | null }>
): string[] {
  let balance = 0
  return entries.map(e => {
    balance += toInt(e.debit) - toInt(e.credit)
    return fromInt(balance)
  })
}

export function isZeroBalance(entries: Array<{
  debit: string | null
  credit: string | null
}>): boolean {
  const balances = computeRunningBalances(entries)
  return balances[balances.length - 1] === '0.0000'
}
