import { useAppStore } from '@/store'

export class FormattingService {
  static getSettings() {
    const settings = useAppStore.getState().settings || {}
    return {
      currency: settings.currency || 'AED',
      currencySymbol: settings.currency_symbol || 'AED',
      quantityUnit: settings.quantity_unit || 'Gallon',
      quantityAbbreviation: settings.quantity_abbreviation || settings.fuel_unit || 'Gal',
      quantityPrecision: parseInt(settings.quantity_precision || '2', 10),
      pricePrecision: parseInt(settings.price_precision || '2', 10),
    }
  }

  static formatCurrency(cents: number): string {
    const { currencySymbol, pricePrecision } = this.getSettings()
    const amount = cents / 100
    const formattedVal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: pricePrecision,
      maximumFractionDigits: pricePrecision,
    }).format(amount)
    return `${currencySymbol} ${formattedVal}`
  }

  static formatCurrencyWithoutSymbol(cents: number): string {
    const { pricePrecision } = this.getSettings()
    const amount = cents / 100
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: pricePrecision,
      maximumFractionDigits: pricePrecision,
    }).format(amount)
  }

  static formatQuantity(quantity: number): string {
    const { quantityAbbreviation, quantityPrecision } = this.getSettings()
    const formattedVal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: quantityPrecision,
      maximumFractionDigits: quantityPrecision,
    }).format(quantity)
    return `${formattedVal} ${quantityAbbreviation}`
  }

  static formatQuantityWithoutUnit(quantity: number): string {
    const { quantityPrecision } = this.getSettings()
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: quantityPrecision,
      maximumFractionDigits: quantityPrecision,
    }).format(quantity)
  }

  static formatVolume(quantity: number, decimals?: number): string {
    const { quantityAbbreviation, quantityPrecision } = this.getSettings()
    const precision = decimals !== undefined ? decimals : quantityPrecision
    const formattedVal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(quantity)
    return `${formattedVal} ${quantityAbbreviation}`
  }

  static getVolumeUnit(): string {
    const { quantityAbbreviation } = this.getSettings()
    return quantityAbbreviation
  }

  static formatUnit(quantity: number): string {
    const { quantityAbbreviation } = this.getSettings()
    return `${quantity} ${quantityAbbreviation}`
  }

  static getLocalDateString(d: Date = new Date()): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  static formatRate(centsPerUnit: number): string {
    const { currencySymbol, quantityAbbreviation, pricePrecision } = this.getSettings()
    const rate = centsPerUnit / 100
    const formattedVal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: pricePrecision,
      maximumFractionDigits: pricePrecision,
    }).format(rate)
    return `${currencySymbol} ${formattedVal} / ${quantityAbbreviation}`
  }

  static formatPercentage(value: number): string {
    return `${value.toFixed(2)}%`
  }

  static formatWeight(quantity: number): string {
    return this.formatQuantity(quantity)
  }
}
