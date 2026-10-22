import { formatMoney, formatNumber, type FormatSettings } from "@/lib/utils/format"

/**
 * A Stripe amount (in the smallest currency unit) as money: `formatMoney` for
 * US dollars ("$5.00"), the currency's own symbol otherwise. Null for custom
 * pricing. Client-safe: no Stripe or Prisma import.
 */
export function formatPlanAmount(
  amount: number | null,
  currency: string | null,
  settings: Pick<FormatSettings, "locale">
): string | null {
  if (amount === null || !currency) return null
  const major = amount / 100
  if (currency.toLowerCase() === "usd") return formatMoney(major, "prose", settings)
  try {
    return formatNumber(major, settings, { style: "currency", currency: currency.toUpperCase() })
  } catch {
    // An unknown currency code: a plain number and the code.
    return `${major.toFixed(2)} ${currency.toUpperCase()}`
  }
}
