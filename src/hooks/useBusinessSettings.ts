import { useAppStore } from '@/store'

export interface BusinessSettings {
  currency: string
  currencySymbol: string
  quantityUnit: string
  quantityAbbreviation: string
  quantityPrecision: number
  pricePrecision: number
}

export function useBusinessSettings(): BusinessSettings {
  const settings = useAppStore((state) => state.settings || {})

  return {
    currency: settings.currency || 'AED',
    currencySymbol: settings.currency_symbol || 'AED',
    quantityUnit: settings.quantity_unit || 'Gallon',
    quantityAbbreviation: settings.quantity_abbreviation || settings.fuel_unit || 'Gal',
    quantityPrecision: parseInt(settings.quantity_precision || '2', 10),
    pricePrecision: parseInt(settings.price_precision || '2', 10),
  }
}
