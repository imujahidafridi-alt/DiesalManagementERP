import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FormattingService } from './FormattingService'

const SGGT_LOGO_PNG = 'data:image/png;base64,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';

export interface PdfServiceOptions {
  startDate?: string
  endDate?: string
  companyName?: string
  title?: string
  partyName?: string
  drivers?: any[]
  customers?: any[]
  suppliers?: any[]
  profitSummary?: any
  operator?: string
  openingBalance?: number
}

export class PdfService {
  static generateReportPDF(
    reportType: string,
    data: any[],
    options: PdfServiceOptions = {}
  ): void {
    // Default to A4 Landscape, Portrait for ledgers
    const isLedger = ['customer_ledger_detail', 'driver_inventory_ledger_detail', 'driver_sales_ledger_detail', 'purchase_register', 'sales_register', 'transfer_register'].includes(reportType)
    const doc = new jsPDF({
      orientation: isLedger ? 'portrait' : 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const reportTitle = options.title || this.getReportTitle(reportType)
    const startDate = options.startDate || 'Any'
    const endDate = options.endDate || 'Any'
    const dateRange = `${startDate} to ${endDate}`

    const drivers = options.drivers || []
    const customers = options.customers || []
    const suppliers = options.suppliers || []

    let headers: any[] = []
    let body: any[][] = []
    let foot: any[][] = []
    let columnStyles: Record<number, any> = {}

    switch (reportType) {
      case 'customer_ledger_detail': {
        headers = [
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'Voucher No', styles: { halign: 'left' } },
          { content: 'Sold Volume', styles: { halign: 'right' } },
          { content: 'Price', styles: { halign: 'right' } },
          { content: 'Amount', styles: { halign: 'right' } },
          { content: 'Balance', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalAmt = 0
        let closingBal = 0

        body = data.map((row) => {
          const qty = row.quantity || 0
          const rate = row.sellingRate || 0
          const amount = qty * rate
          totalVol += qty
          totalAmt += amount
          closingBal = row.runningBalance || 0

          return [
            row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '',
            row.transactionNumber || '-',
            FormattingService.formatQuantityWithoutUnit(qty),
            FormattingService.formatCurrencyWithoutSymbol(rate),
            FormattingService.formatCurrencyWithoutSymbol(amount),
            FormattingService.formatCurrencyWithoutSymbol(row.runningBalance || 0),
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 2, styles: { halign: 'left' } },
          { content: FormattingService.formatQuantityWithoutUnit(totalVol), styles: { halign: 'right' } },
          '',
          { content: FormattingService.formatCurrencyWithoutSymbol(totalAmt), styles: { halign: 'right' } },
          { content: FormattingService.formatCurrencyWithoutSymbol(closingBal), styles: { halign: 'right' } },
        ]]

        columnStyles = {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        }
        break
      }

      case 'driver_inventory_ledger_detail': {
        headers = [
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'Type', styles: { halign: 'left' } },
          { content: 'Qty In', styles: { halign: 'right' } },
          { content: 'Qty Out', styles: { halign: 'right' } },
          { content: 'Rate', styles: { halign: 'right' } },
          { content: 'Cost', styles: { halign: 'right' } },
          { content: 'Vehicle No', styles: { halign: 'right' } },
          { content: 'Balance', styles: { halign: 'right' } },
        ]

        let totalQtyIn = 0
        let totalQtyOut = 0
        let totalCost = 0
        let closingStock = 0

        body = data.map((row) => {
          const isQtyIn = row.transactionType === 'PURCHASE' || (row.transactionType === 'TRANSFER' && row.qtyIn > 0)
          const qtyIn = isQtyIn ? (row.quantity || 0) : 0
          const qtyOut = !isQtyIn ? (row.quantity || 0) : 0

          const buyRate = row.averageCostSnapshot || row.unitCost || 0
          const cost = (qtyIn || qtyOut) * buyRate

          totalQtyIn += qtyIn
          totalQtyOut += qtyOut
          totalCost += cost
          closingStock = row.runningBalance || 0

          let typeLabel = row.transactionType
          if (row.transactionType === 'TRANSFER') {
            typeLabel = row.qtyIn > 0 ? 'Transfer In' : 'Transfer Out'
          } else if (row.transactionType === 'PURCHASE') {
            typeLabel = 'Purchase'
          } else if (row.transactionType === 'SALE') {
            typeLabel = 'Sale'
          }

          return [
            row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '',
            typeLabel || '-',
            qtyIn > 0 ? FormattingService.formatQuantityWithoutUnit(qtyIn) : '-',
            qtyOut > 0 ? FormattingService.formatQuantityWithoutUnit(qtyOut) : '-',
            buyRate > 0 ? FormattingService.formatCurrencyWithoutSymbol(buyRate) : '-',
            cost > 0 ? FormattingService.formatCurrencyWithoutSymbol(cost) : '-',
            row.referenceNumber || '-',
            `${FormattingService.formatQuantityWithoutUnit(row.runningBalance || 0)} Gal`,
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 2, styles: { halign: 'left' } },
          { content: FormattingService.formatQuantityWithoutUnit(totalQtyIn), styles: { halign: 'right' } },
          { content: FormattingService.formatQuantityWithoutUnit(totalQtyOut), styles: { halign: 'right' } },
          '',
          { content: FormattingService.formatCurrencyWithoutSymbol(totalCost), styles: { halign: 'right' } },
          '',
          { content: `${FormattingService.formatQuantityWithoutUnit(closingStock)} Gal`, styles: { halign: 'right' } },
        ]]

        columnStyles = {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        }
        break
      }

      case 'driver_sales_ledger_detail': {
        headers = [
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'Customer', styles: { halign: 'left' } },
          { content: 'Sold Volume', styles: { halign: 'right' } },
          { content: 'Sale Price', styles: { halign: 'right' } },
          { content: 'Buy Rate', styles: { halign: 'right' } },
          { content: 'Profit / Gal', styles: { halign: 'right' } },
          { content: 'Sale Amount', styles: { halign: 'right' } },
          { content: 'Total Profit', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalSales = 0
        let totalCost = 0
        let totalProfit = 0

        const validRows = data.filter((row) => (row.quantity || row.volume || 0) > 0)

        body = validRows.map((row) => {
          const qty = row.quantity || row.volume || 0
          const salePrice = row.sellingRate || 0
          const buyCost = row.averageCostSnapshot || row.unitCost || 0
          const profitPerUnit = salePrice - buyCost
          const saleAmount = qty * salePrice
          const totalRowProfit = qty * profitPerUnit

          totalVol += qty
          totalSales += saleAmount
          totalCost += qty * buyCost
          totalProfit += totalRowProfit

          const rawCustName = row.destinationName || row.partyName || '-'
          const customerName = rawCustName.length > 25 ? rawCustName.substring(0, 22) + '...' : rawCustName

          return [
            row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '',
            customerName,
            FormattingService.formatQuantityWithoutUnit(qty),
            FormattingService.formatCurrencyWithoutSymbol(salePrice),
            FormattingService.formatCurrencyWithoutSymbol(buyCost),
            FormattingService.formatCurrencyWithoutSymbol(profitPerUnit),
            FormattingService.formatCurrencyWithoutSymbol(saleAmount),
            FormattingService.formatCurrencyWithoutSymbol(totalRowProfit),
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 2, styles: { halign: 'left' } },
          { content: FormattingService.formatQuantityWithoutUnit(totalVol), styles: { halign: 'right' } },
          '',
          '',
          '',
          { content: FormattingService.formatCurrencyWithoutSymbol(totalSales), styles: { halign: 'right' } },
          { content: FormattingService.formatCurrencyWithoutSymbol(totalProfit), styles: { halign: 'right' } },
        ]]

        columnStyles = {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        }
        break
      }

      case 'driver_ledger': {
        headers = [
          'Driver Name',
          'Opening Stock',
          'Transferred In',
          'Transferred Out',
          'Total Sold',
          'Adjusted',
          'Closing Stock',
        ]

        let totalOpening = 0
        let totalIn = 0
        let totalOut = 0
        let totalSold = 0
        let totalAdjusted = 0
        let totalClosing = 0

        body = data.map((row) => {
          totalOpening += row.openingBalance || 0
          totalIn += row.transferredIn || 0
          totalOut += row.transferredOut || 0
          totalSold += row.sold || 0
          totalAdjusted += row.adjusted || 0
          totalClosing += row.closingBalance || 0

          return [
            row.driverName || 'Unknown',
            FormattingService.formatQuantity(row.openingBalance || 0),
            FormattingService.formatQuantity(row.transferredIn || 0),
            FormattingService.formatQuantity(row.transferredOut || 0),
            FormattingService.formatQuantity(row.sold || 0),
            FormattingService.formatQuantity(row.adjusted || 0),
            FormattingService.formatQuantity(row.closingBalance || 0),
          ]
        })

        foot = [[
          'Total / Summary',
          FormattingService.formatQuantity(totalOpening),
          FormattingService.formatQuantity(totalIn),
          FormattingService.formatQuantity(totalOut),
          FormattingService.formatQuantity(totalSold),
          FormattingService.formatQuantity(totalAdjusted),
          FormattingService.formatQuantity(totalClosing),
        ]]

        columnStyles = {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        }
        break
      }

      case 'customer_ledger': {
        headers = [
          'Customer Entity',
          'Purchased Vol',
          'Total Invoiced',
          'Avg Selling Rate',
          'Outstanding Balance',
          'Last Sale Date',
        ]

        let totalPurchases = 0
        let totalRevenue = 0
        let totalBalance = 0

        body = data.map((row) => {
          totalPurchases += row.purchases || 0
          totalRevenue += row.revenue || 0
          totalBalance += row.closingBalance || 0

          return [
            row.customerName || 'Unknown',
            FormattingService.formatQuantity(row.purchases || 0),
            FormattingService.formatCurrency(row.revenue || 0),
            FormattingService.formatRate(row.averageRate || 0),
            FormattingService.formatCurrency(row.closingBalance || 0),
            row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString() : 'N/A',
          ]
        })

        foot = [[
          'Total / Summary',
          FormattingService.formatQuantity(totalPurchases),
          FormattingService.formatCurrency(totalRevenue),
          '-',
          FormattingService.formatCurrency(totalBalance),
          '',
        ]]

        columnStyles = {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        }
        break
      }

      case 'supplier_ledger': {
        headers = [
          'Supplier Name',
          'Invoice Count',
          'Total Volume',
          'Weighted Avg Cost',
          'Total Paid Assets',
          'Last Purchase Date',
        ]

        let totalInvoices = 0
        let totalVol = 0
        let totalPaid = 0

        body = data.map((row) => {
          totalInvoices += row.purchasesCount || 0
          totalVol += row.totalVolume || 0
          totalPaid += row.totalAmount || 0

          return [
            row.companyName || 'Unknown',
            row.purchasesCount || 0,
            FormattingService.formatQuantity(row.totalVolume || 0),
            FormattingService.formatRate(row.averageCost || 0),
            FormattingService.formatCurrency(row.totalAmount || 0),
            row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString() : 'N/A',
          ]
        })

        foot = [[
          'Total / Summary',
          totalInvoices,
          FormattingService.formatQuantity(totalVol),
          '-',
          FormattingService.formatCurrency(totalPaid),
          '',
        ]]

        columnStyles = {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        }
        break
      }

      case 'purchase_register': {
        headers = [
          { content: 'Invoice No', styles: { halign: 'left' } },
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'Supplier Refinery', styles: { halign: 'left' } },
          { content: 'Volume', styles: { halign: 'right' } },
          { content: 'Unit Cost', styles: { halign: 'right' } },
          { content: 'Total Cost', styles: { halign: 'right' } },
          { content: 'Vehicle Number', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalAmt = 0

        body = data.map((row) => {
          const supplierName = suppliers.find((s) => s.id === row.sourceId)?.companyName || 'Refinery Bulk'
          const rowTotal = Math.round(row.quantity * row.unitCost)
          totalVol += row.quantity || 0
          totalAmt += rowTotal

          return [
            row.transactionNumber || 'N/A',
            new Date(row.transactionDate).toLocaleDateString(),
            supplierName,
            FormattingService.formatQuantity(row.quantity || 0),
            FormattingService.formatRate(row.unitCost || 0),
            FormattingService.formatCurrency(rowTotal),
            row.referenceNumber || '-',
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 3, styles: { halign: 'left' } },
          { content: FormattingService.formatQuantity(totalVol), styles: { halign: 'right' } },
          '',
          { content: FormattingService.formatCurrency(totalAmt), styles: { halign: 'right' } },
          '',
        ]]

        columnStyles = {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        }
        break
      }

      case 'sales_register': {
        headers = [
          { content: 'Invoice No', styles: { halign: 'left' } },
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'Customer Co.', styles: { halign: 'left' } },
          { content: 'Volume', styles: { halign: 'right' } },
          { content: 'Sale Rate', styles: { halign: 'right' } },
          { content: 'Unit Cost', styles: { halign: 'right' } },
          { content: 'Revenue', styles: { halign: 'right' } },
          { content: 'Gross Profit', styles: { halign: 'right' } },
          { content: 'Vehicle Number', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalRevenue = 0
        let totalProfit = 0

        body = data.map((row) => {
          const customerName = customers.find((c) => c.id === row.destinationId)?.companyName || 'Client'
          const rowRevenue = Math.round(row.quantity * row.sellingRate)
          totalVol += row.quantity || 0
          totalRevenue += rowRevenue
          totalProfit += row.profitSnapshot || 0

          return [
            row.transactionNumber || 'N/A',
            row.transactionDate ? (() => {
              const d = new Date(row.transactionDate)
              const day = String(d.getDate()).padStart(2, '0')
              const month = String(d.getMonth() + 1).padStart(2, '0')
              const year = d.getFullYear()
              return `${day}/${month}/${year}`
            })() : '',
            customerName,
            FormattingService.formatQuantityWithoutUnit(row.quantity || 0),
            FormattingService.formatCurrencyWithoutSymbol(row.sellingRate || 0),
            FormattingService.formatCurrencyWithoutSymbol(row.averageCostSnapshot || row.unitCost || 0),
            FormattingService.formatCurrencyWithoutSymbol(rowRevenue),
            FormattingService.formatCurrencyWithoutSymbol(row.profitSnapshot || 0),
            row.vehicleNumber || row.referenceNumber || '-',
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 3, styles: { halign: 'left' } },
          { content: FormattingService.formatQuantityWithoutUnit(totalVol), styles: { halign: 'right' } },
          '',
          '',
          { content: FormattingService.formatCurrencyWithoutSymbol(totalRevenue), styles: { halign: 'right' } },
          { content: FormattingService.formatCurrencyWithoutSymbol(totalProfit), styles: { halign: 'right' } },
          '',
        ]]

        columnStyles = {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
        }
        break
      }

      case 'transfer_register': {
        headers = [
          { content: 'Invoice No', styles: { halign: 'left' } },
          { content: 'Date', styles: { halign: 'left' } },
          { content: 'From', styles: { halign: 'left' } },
          { content: 'To', styles: { halign: 'left' } },
          { content: 'Vehicle Number', styles: { halign: 'right' } },
          { content: 'Volume', styles: { halign: 'right' } },
          { content: 'WAC Rate', styles: { halign: 'right' } },
          { content: 'Total Value', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalAmt = 0

        body = data.map((row) => {
          const source = drivers.find((drv) => drv.id === row.sourceId)?.name ||
            suppliers.find((sup) => sup.id === row.sourceId)?.companyName ||
            row.sourceId
          const destination = drivers.find((drv) => drv.id === row.destinationId)?.name ||
            customers.find((c) => c.id === row.destinationId)?.companyName ||
            row.destinationId
          const rowVal = Math.round((row.quantity || 0) * (row.unitCost || 0))
          totalVol += row.quantity || 0
          totalAmt += rowVal

          return [
            row.transactionNumber || 'N/A',
            row.transactionDate ? (() => {
              const d = new Date(row.transactionDate)
              const day = String(d.getDate()).padStart(2, '0')
              const month = String(d.getMonth() + 1).padStart(2, '0')
              const year = d.getFullYear()
              return `${day}/${month}/${year}`
            })() : '',
            source,
            destination,
            row.referenceNumber || '—',
            FormattingService.formatQuantityWithoutUnit(row.quantity || 0),
            FormattingService.formatCurrencyWithoutSymbol(row.unitCost || 0),
            FormattingService.formatCurrencyWithoutSymbol(rowVal),
          ]
        })

        foot = [[
          { content: 'Total / Summary', colSpan: 4, styles: { halign: 'left' } },
          '',
          { content: FormattingService.formatQuantityWithoutUnit(totalVol), styles: { halign: 'right' } },
          '',
          { content: FormattingService.formatCurrencyWithoutSymbol(totalAmt), styles: { halign: 'right' } },
        ]]

        columnStyles = {
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        }
        break
      }

      case 'inventory_valuation': {
        headers = [
          { content: 'Driver Name', styles: { halign: 'left' } },
          { content: 'Current Stock', styles: { halign: 'right' } },
          { content: 'Carrying WAC', styles: { halign: 'right' } },
          { content: 'Asset Value', styles: { halign: 'right' } },
        ]

        let totalStock = 0
        let totalVal = 0

        body = data.map((row) => {
          totalStock += row.currentStock || 0
          totalVal += row.totalAssetValue || 0

          return [
            row.locationName || 'Unknown',
            FormattingService.formatQuantity(row.currentStock || 0),
            FormattingService.formatRate(row.weightedAverageCost || 0),
            FormattingService.formatCurrency(row.totalAssetValue || 0),
          ]
        })

        foot = [[
          { content: 'Total / Summary', styles: { halign: 'left' } },
          { content: FormattingService.formatQuantity(totalStock), styles: { halign: 'right' } },
          '',
          { content: FormattingService.formatCurrency(totalVal), styles: { halign: 'right' } },
        ]]

        columnStyles = {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        }
        break
      }

      case 'profit_analysis': {
        headers = [
          { content: 'Customer Name', styles: { halign: 'left' } },
          { content: 'Total Volume', styles: { halign: 'right' } },
          { content: 'Total Revenue Invoiced', styles: { halign: 'right' } },
          { content: 'Gross Margin Profit', styles: { halign: 'right' } },
        ]

        let totalVol = 0
        let totalRev = 0
        let totalProf = 0

        body = data.map((row) => {
          totalVol += row.quantity || 0
          totalRev += row.revenue || 0
          totalProf += row.profit || 0

          return [
            row.entity || '-',
            FormattingService.formatQuantity(row.quantity || 0),
            FormattingService.formatCurrency(row.revenue || 0),
            FormattingService.formatCurrency(row.profit || 0),
          ]
        })

        foot = [[
          { content: 'Summary Total', styles: { halign: 'left' } },
          { content: FormattingService.formatQuantity(totalVol), styles: { halign: 'right' } },
          { content: FormattingService.formatCurrency(totalRev), styles: { halign: 'right' } },
          { content: FormattingService.formatCurrency(totalProf), styles: { halign: 'right' } },
        ]]

        columnStyles = {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        }
        break
      }

      default: {
        // Fallback filtering internal columns out cleanly
        const badKeys = ['id', 'uuid', 'sourceid', 'destinationid', 'createdat', 'updatedat', 'deletedat']
        const keys = Object.keys(data[0] || {}).filter((k) => !badKeys.includes(k.toLowerCase()))

        headers = keys.map((k) => k.replace(/([A-Z])/g, ' $1').toUpperCase().trim())
        body = data.map((row) =>
          keys.map((k) => {
            const val = row[k]
            if (val === null || val === undefined) return '-'
            return String(val)
          })
        )
        break
      }
    }

    const { currency, quantityAbbreviation } = FormattingService.getSettings()

    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight()
    const totalPagesExp = '{total_pages_count_string}'

    let marginTop = options.partyName ? 30 : 25
    if (isLedger) {
      marginTop += 4.5
    }
    let startY = marginTop

    // Add profit summary text card at top of Profit Analysis report
    if (reportType === 'profit_analysis' && options.profitSummary) {
      const summary = options.profitSummary
      const rev = FormattingService.formatCurrency(summary.totalRevenue || 0)
      const cogs = FormattingService.formatCurrency(summary.totalCost || 0)
      const profit = FormattingService.formatCurrency(summary.grossProfit || 0)
      const margin = FormattingService.formatPercentage(summary.marginPercentage || 0)

      const boxWidth = pageWidth - 30

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setFillColor(243, 244, 246)
      doc.rect(15, startY, boxWidth, 18, 'F')
      doc.setDrawColor(229, 231, 235)
      doc.rect(15, startY, boxWidth, 18, 'S')

      doc.setTextColor(31, 41, 55)
      const colWidth = boxWidth / 4
      doc.text(`Total Revenue: ${rev}`, 20, startY + 10)
      doc.text(`COGS Cost: ${cogs}`, 20 + colWidth, startY + 10)
      doc.text(`Gross Profit: ${profit}`, 20 + colWidth * 2, startY + 10)
      doc.text(`Profit Margin: ${margin}`, 20 + colWidth * 3, startY + 10)

      startY += 23
    }

    autoTable(doc, {
      head: [headers],
      body: body,
      foot: foot.length > 0 ? foot : undefined,
      startY: startY,
      margin: { top: marginTop, right: 15, bottom: 20, left: 15 },
      styles: {
        fontSize: isLedger ? 8.5 : 7.5,
        cellPadding: isLedger ? 1.2 : 2,
        overflow: 'linebreak',
        font: 'helvetica',
        lineColor: [229, 231, 235], // Light gray horizontal lines
        lineWidth: { bottom: 0.1 },
      },
      headStyles: {
        fontSize: isLedger ? 9.5 : 7.5,
        fillColor: [255, 255, 255], // Standard B&W theme (White background)
        textColor: [0, 0, 0], // Black text
        fontStyle: 'bold',
        lineColor: [0, 0, 0], // Black borders
        lineWidth: { bottom: 0.3, top: 0.3 }, // Only top and bottom borders, no vertical dividers
      },
      footStyles: {
        fillColor: [243, 244, 246], // Gray 100 theme
        textColor: 31,
        fontStyle: 'bold',
        lineColor: [229, 231, 235],
        lineWidth: { bottom: 0.1, top: 0.1 },
      },
      columnStyles: columnStyles,
      theme: 'plain',

      didDrawPage: (data) => {
        // Left Column: Brand Identity
        // Draw SGGT Logo (increased size by ~30%)
        doc.addImage(SGGT_LOGO_PNG, 'PNG', 15, 5, 33, 12.68)

        // Draw subheader (styled small, uppercase, and gray/muted)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(55, 65, 81) // Dark gray
        doc.text('SAHARA GROUP GENERAL TRANSPORT', 15, 21.5)

        // Right Column: Report Meta Data (flush-right aligned)
        let rightY = 11
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.setTextColor(31, 41, 55) // Gray 800
        doc.text(reportTitle, pageWidth - 15, rightY, { align: 'right' })

        if (options.partyName) {
          rightY += 5.5
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(55, 65, 81)
          doc.text(`Party Name: ${options.partyName}`, pageWidth - 15, rightY, { align: 'right' })
        }

        rightY += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(107, 114, 128) // Gray 500
        doc.text(`Date Range: ${dateRange}`, pageWidth - 15, rightY, { align: 'right' })

        if (isLedger) {
          rightY += 4.5
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(55, 65, 81)
          doc.text(`Currency: ${currency}    |    Volume Unit: ${quantityAbbreviation}`, pageWidth - 15, rightY, { align: 'right' })
        }

        const dividerY = marginTop - 4

        // Divider line
        doc.setDrawColor(229, 231, 235) // Gray 200
        doc.setLineWidth(0.3)
        doc.line(15, dividerY, pageWidth - 15, dividerY)

        // Draw repeating footer
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15)
        doc.setFontSize(8)
        doc.text('Sahara Group General Transport Diesel Management system', 15, pageHeight - 9)
        doc.text(`Page ${data.pageNumber} of ${totalPagesExp}`, pageWidth - 35, pageHeight - 9)
      },
    })

    // Drawing the summary block at the end of the report
    if (isLedger) {
      const finalY = (doc as any).lastAutoTable.finalY || startY
      let summaryY = finalY + 10

      // If summary block overflows pageHeight, add new page
      const isCompactLedger = ['driver_inventory_ledger_detail', 'driver_sales_ledger_detail', 'purchase_register', 'sales_register', 'transfer_register'].includes(reportType)
      const summaryBoxHeight = isCompactLedger ? 29 : 40
      if (summaryY + summaryBoxHeight + 5 > pageHeight - 15) {
        doc.addPage()
        summaryY = 20
      }

      // Draw a nice summary block box
      doc.setFillColor(249, 250, 251) // Gray 50
      doc.setDrawColor(229, 231, 235) // Gray 200
      doc.setLineWidth(0.3)
      doc.rect(15, summaryY, pageWidth - 30, summaryBoxHeight, 'F')
      doc.rect(15, summaryY, pageWidth - 30, summaryBoxHeight, 'S')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(31, 41, 55)
      doc.text('STATEMENT SUMMARY', 20, summaryY + 7)

      // Let's compute values based on reportType
      let items: { label: string; value: string }[] = []
      if (reportType === 'customer_ledger_detail') {
        const totalQty = data.reduce((acc, r) => acc + (r.quantity || 0), 0)
        const totalAmt = data.reduce((acc, r) => acc + ((r.quantity || 0) * (r.sellingRate || 0)), 0)
        const finalBal = data.length > 0 ? (data[data.length - 1].runningBalance || 0) : 0
        const openBal = options.openingBalance !== undefined ? options.openingBalance : 0

        items = [
          { label: 'Opening Balance', value: FormattingService.formatCurrencyWithoutSymbol(openBal) },
          { label: 'Total Sold Volume', value: FormattingService.formatQuantityWithoutUnit(totalQty) },
          { label: 'Total Sales Amount', value: FormattingService.formatCurrencyWithoutSymbol(totalAmt) },
          { label: 'Closing Balance', value: FormattingService.formatCurrencyWithoutSymbol(finalBal) },
        ]
      } else if (reportType === 'driver_inventory_ledger_detail') {
        const totalQtyIn = data.reduce((acc, r) => {
          const isQtyIn = r.transactionType === 'PURCHASE' || (r.transactionType === 'TRANSFER' && r.qtyIn > 0)
          return acc + (isQtyIn ? (r.quantity || 0) : 0)
        }, 0)
        const totalQtyOut = data.reduce((acc, r) => {
          const isQtyIn = r.transactionType === 'PURCHASE' || (r.transactionType === 'TRANSFER' && r.qtyIn > 0)
          return acc + (!isQtyIn ? (r.quantity || 0) : 0)
        }, 0)
        const finalBal = data.length > 0 ? (data[data.length - 1].runningBalance || 0) : 0
        const openBal = options.openingBalance !== undefined ? options.openingBalance : 0

        items = [
          { label: 'Opening Stock', value: `${FormattingService.formatQuantityWithoutUnit(openBal)} Gal` },
          { label: 'Total Qty In', value: `${FormattingService.formatQuantityWithoutUnit(totalQtyIn)} Gal` },
          { label: 'Total Qty Out', value: `${FormattingService.formatQuantityWithoutUnit(totalQtyOut)} Gal` },
          { label: 'Closing Stock', value: `${FormattingService.formatQuantityWithoutUnit(finalBal)} Gal` },
        ]
      } else if (reportType === 'driver_sales_ledger_detail') {
        const totalQty = data.reduce((acc, r) => acc + (r.quantity || r.volume || 0), 0)
        const totalSales = data.reduce((acc, r) => acc + ((r.quantity || r.volume || 0) * (r.sellingRate || 0)), 0)
        const totalCost = data.reduce((acc, r) => acc + ((r.quantity || r.volume || 0) * (r.averageCostSnapshot || r.unitCost || 0)), 0)
        const totalProfit = totalSales - totalCost

        items = [
          { label: 'Total Sold Volume', value: `${FormattingService.formatQuantityWithoutUnit(totalQty)} Gal` },
          { label: 'Total Sales Amount', value: FormattingService.formatCurrencyWithoutSymbol(totalSales) },
          { label: 'Total Cost', value: FormattingService.formatCurrencyWithoutSymbol(totalCost) },
          { label: 'Total Profit', value: FormattingService.formatCurrencyWithoutSymbol(totalProfit) },
        ]
      } else if (reportType === 'purchase_register') {
        const totalQty = data.reduce((acc, r) => acc + (r.quantity || 0), 0)
        const totalCost = data.reduce((acc, r) => acc + Math.round((r.quantity || 0) * (r.unitCost || 0)), 0)
        items = [
          { label: 'Total Purchases', value: String(data.length) },
          { label: 'Total Purchased Volume', value: `${FormattingService.formatQuantityWithoutUnit(totalQty)} Gal` },
          { label: 'Total Purchase Cost', value: FormattingService.formatCurrencyWithoutSymbol(totalCost) },
        ]
      } else if (reportType === 'sales_register') {
        const totalQty = data.reduce((acc, r) => acc + (r.quantity || 0), 0)
        const totalRevenue = data.reduce((acc, r) => acc + Math.round((r.quantity || 0) * (r.sellingRate || 0)), 0)
        const totalProfit = data.reduce((acc, r) => acc + (r.profitSnapshot || 0), 0)
        items = [
          { label: 'Sales Transactions', value: String(data.length) },
          { label: 'Total Sold Volume', value: `${FormattingService.formatQuantityWithoutUnit(totalQty)} Gal` },
          { label: 'Total Revenue', value: FormattingService.formatCurrencyWithoutSymbol(totalRevenue) },
          { label: 'Total Gross Profit', value: FormattingService.formatCurrencyWithoutSymbol(totalProfit) },
        ]
      } else if (reportType === 'transfer_register') {
        const totalQty = data.reduce((acc, r) => acc + (r.quantity || 0), 0)
        const totalCost = data.reduce((acc, r) => acc + Math.round((r.quantity || 0) * (r.unitCost || 0)), 0)
        items = [
          { label: 'Transfer Transactions', value: String(data.length) },
          { label: 'Total Volume Transferred', value: `${FormattingService.formatQuantityWithoutUnit(totalQty)} Gal` },
          { label: 'Transferred Inventory Value', value: FormattingService.formatCurrencyWithoutSymbol(totalCost) },
        ]
      }

      // Draw items inside the box
      if (isCompactLedger) {
        // Redesigned compact summary block for Driver Inventory Ledger
        let currentItemY = summaryY + 11

        items.forEach((item, idx) => {
          const itemX = 20
          const itemY = currentItemY + idx * 4.5
          const totalWidth = 90 // 90mm width for the summary list

          const label = item.label
          const valStr = item.value

          // Draw label: Gray 600 to look semi-bold
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(75, 85, 99)
          const textWidth = doc.getTextWidth(label)
          doc.text(label, itemX, itemY)

          // Draw values: Dark Gray 900 to look bold
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(17, 24, 39)
          const valWidth = doc.getTextWidth(valStr)

          // draw dots
          doc.setTextColor(209, 213, 219)
          const dotStart = itemX + textWidth + 2
          const dotEnd = itemX + totalWidth - valWidth - 2
          if (dotEnd > dotStart) {
            const numDots = Math.floor((dotEnd - dotStart) / 1.5)
            const dotStr = '.'.repeat(Math.max(0, numDots))
            doc.text(dotStr, dotStart, itemY)
          }
          doc.setTextColor(17, 24, 39)
          doc.text(valStr, itemX + totalWidth - valWidth, itemY)
        })
      } else {
        // Default layout for other ledgers
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(107, 114, 128)
        doc.text(`Currency: ${currency}    |    Volume Unit: ${quantityAbbreviation}`, 20, summaryY + 12)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(55, 65, 81)
        let currentItemY = summaryY + 18
        const colWidth = (pageWidth - 40) / 2

        items.forEach((item, idx) => {
          const col = idx % 2
          const row = Math.floor(idx / 2)
          const itemX = 20 + col * colWidth
          const itemY = currentItemY + row * 6

          // Label and value with dot connectors
          const label = item.label
          const valStr = item.value
          const textWidth = doc.getTextWidth(label)
          const valWidth = doc.getTextWidth(valStr)
          const totalWidth = colWidth - 10

          // draw label
          doc.text(label, itemX, itemY)
          // draw dots
          doc.setTextColor(209, 213, 219) // Light gray
          const dotStart = itemX + textWidth + 2
          const dotEnd = itemX + totalWidth - valWidth - 2
          let dotStr = ''
          if (dotEnd > dotStart) {
            const numDots = Math.floor((dotEnd - dotStart) / 1.5)
            dotStr = '.'.repeat(Math.max(0, numDots))
            doc.text(dotStr, dotStart, itemY)
          }
          doc.setTextColor(31, 41, 55) // Dark gray for value
          doc.text(valStr, itemX + totalWidth - valWidth, itemY)
        })
      }
    }

    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages(totalPagesExp)
    }

    const cleanTitle = reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    doc.save(`report_${cleanTitle}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  private static getReportTitle(type: string): string {
    switch (type) {
      case 'driver_ledger':
      case 'driver_inventory_ledger_detail':
        return 'Driver Stock Ledger Statement'
      case 'driver_sales_ledger_detail':
        return 'Driver Sales Ledger Statement'
      case 'customer_ledger':
      case 'customer_ledger_detail':
        return 'Customer Balance Ledger Statement'
      case 'supplier_ledger':
      case 'supplier_ledger_detail':
        return 'Supplier Volume Ledger Statement'
      case 'purchase_register':
        return 'Purchase Register Statement'
      case 'sales_register':
        return 'Sales Register Statement'
      case 'transfer_register':
        return 'Transfer Register Statement'
      case 'inventory_valuation':
        return 'Diesel Stock Inventory Valuation'
      case 'profit_analysis':
        return 'Profitability Margins Analysis Report'
      default:
        return 'Diesel General Report Statement'
    }
  }
}
