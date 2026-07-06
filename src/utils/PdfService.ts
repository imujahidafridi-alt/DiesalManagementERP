import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FormattingService } from './FormattingService'

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
}

export class PdfService {
  static generateReportPDF(
    reportType: string,
    data: any[],
    options: PdfServiceOptions = {}
  ): void {
    // Default to A4 Landscape
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const companyName = options.companyName || 'Malak Enterprise'
    const reportTitle = options.title || this.getReportTitle(reportType)
    const startDate = options.startDate || 'Any'
    const endDate = options.endDate || 'Any'
    const dateRange = `${startDate} to ${endDate}`
    const generatedTimestamp = new Date().toLocaleString()

    const drivers = options.drivers || []
    const customers = options.customers || []
    const suppliers = options.suppliers || []

    let headers: string[] = []
    let body: any[][] = []
    let foot: any[][] = []
    let columnStyles: Record<number, any> = {}

    switch (reportType) {
      case 'customer_ledger_detail': {
        headers = [
          'Date',
          'Voucher No',
          'Sold Volume',
          'Sale Price',
          'Amount',
          'Running Balance',
        ]

        let totalVol = 0
        let totalAmt = 0
        let closingBal = 0

        // Filter and map to only include sales or balance updates
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
            FormattingService.formatQuantity(qty),
            FormattingService.formatRate(rate),
            FormattingService.formatCurrency(amount),
            FormattingService.formatCurrency(row.runningBalance || 0),
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          FormattingService.formatQuantity(totalVol),
          '',
          FormattingService.formatCurrency(totalAmt),
          FormattingService.formatCurrency(closingBal),
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
          'Date',
          'Transaction Type',
          'Qty In',
          'Qty Out',
          'Buy Rate',
          'Cost',
          'Vehicle No',
          'Running Balance',
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
            qtyIn > 0 ? FormattingService.formatQuantity(qtyIn) : '-',
            qtyOut > 0 ? FormattingService.formatQuantity(qtyOut) : '-',
            buyRate > 0 ? FormattingService.formatRate(buyRate) : '-',
            cost > 0 ? FormattingService.formatCurrency(cost) : '-',
            row.referenceNumber || '-',
            FormattingService.formatQuantity(row.runningBalance || 0),
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          FormattingService.formatQuantity(totalQtyIn),
          FormattingService.formatQuantity(totalQtyOut),
          '',
          FormattingService.formatCurrency(totalCost),
          '',
          FormattingService.formatQuantity(closingStock),
        ]]

        columnStyles = {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          7: { halign: 'right' },
        }
        break
      }

      case 'driver_sales_ledger_detail': {
        headers = [
          'Date',
          'Voucher No',
          'Customer',
          'Sold Volume',
          'Sale Price',
          'Buy Cost',
          'Profit per Unit',
          'Sale Amount',
          'Total Profit',
        ]

        let totalVol = 0
        let totalSales = 0
        let totalCost = 0
        let totalProfit = 0

        // Filter out rows with 0 volume to satisfy "Remove any calculations using 0 quantity"
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

          return [
            row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '',
            row.transactionNumber || '-',
            row.destinationName || row.partyName || '-',
            FormattingService.formatQuantity(qty),
            FormattingService.formatRate(salePrice),
            FormattingService.formatRate(buyCost),
            FormattingService.formatRate(profitPerUnit),
            FormattingService.formatCurrency(saleAmount),
            FormattingService.formatCurrency(totalRowProfit),
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          '',
          FormattingService.formatQuantity(totalVol),
          '',
          '',
          '',
          FormattingService.formatCurrency(totalSales),
          FormattingService.formatCurrency(totalProfit),
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
          'Tx No',
          'Date',
          'Supplier Refinery',
          'Volume',
          'Unit Cost',
          'Total Cost',
          'Ref Challan',
          'Operator',
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
            row.createdBy || '-',
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          '',
          FormattingService.formatQuantity(totalVol),
          '',
          FormattingService.formatCurrency(totalAmt),
          '',
          '',
        ]]

        columnStyles = {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        }
        break
      }

      case 'sales_register': {
        headers = [
          'Invoice No',
          'Date',
          'Customer Co.',
          'Volume',
          'Sale Rate',
          'WAC Cost',
          'Revenue',
          'Gross Profit',
          'Delivery Ref',
          'Operator',
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
            new Date(row.transactionDate).toLocaleDateString(),
            customerName,
            FormattingService.formatQuantity(row.quantity || 0),
            FormattingService.formatRate(row.sellingRate || 0),
            FormattingService.formatRate(row.averageCostSnapshot || 0),
            FormattingService.formatCurrency(rowRevenue),
            FormattingService.formatCurrency(row.profitSnapshot || 0),
            row.referenceNumber || '-',
            row.createdBy || '-',
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          '',
          FormattingService.formatQuantity(totalVol),
          '',
          '',
          FormattingService.formatCurrency(totalRevenue),
          FormattingService.formatCurrency(totalProfit),
          '',
          '',
        ]]

        columnStyles = {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        }
        break
      }

      case 'transfer_register': {
        headers = [
          'Gate Pass No',
          'Date',
          'Source Location',
          'Destination',
          'Volume',
          'WAC Cost',
          'Ref GatePass',
          'Operator',
        ]

        let totalVol = 0

        body = data.map((row) => {
          const source = drivers.find((drv) => drv.id === row.sourceId)?.name || 
                         suppliers.find((sup) => sup.id === row.sourceId)?.companyName || 
                         row.sourceId
          const destination = drivers.find((drv) => drv.id === row.destinationId)?.name || 
                              customers.find((c) => c.id === row.destinationId)?.companyName || 
                              row.destinationId
          totalVol += row.quantity || 0

          return [
            row.transactionNumber || 'N/A',
            new Date(row.transactionDate).toLocaleDateString(),
            source,
            destination,
            FormattingService.formatQuantity(row.quantity || 0),
            FormattingService.formatRate(row.unitCost || 0),
            row.referenceNumber || '-',
            row.createdBy || '-',
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          '',
          '',
          FormattingService.formatQuantity(totalVol),
          '',
          '',
          '',
        ]]

        columnStyles = {
          4: { halign: 'right' },
          5: { halign: 'right' },
        }
        break
      }

      case 'inventory_valuation': {
        headers = [
          'Storage Tank / Vehicle',
          'Type',
          'Volume Capacity',
          'Current Stock',
          'Carrying WAC',
          'Asset Value',
        ]

        let totalCap = 0
        let totalStock = 0
        let totalVal = 0

        body = data.map((row) => {
          totalCap += row.capacity || 0
          totalStock += row.currentStock || 0
          totalVal += row.totalAssetValue || 0

          return [
            row.locationName || 'Unknown',
            row.locationType || 'DRIVER',
            FormattingService.formatQuantity(row.capacity || 0),
            FormattingService.formatQuantity(row.currentStock || 0),
            FormattingService.formatRate(row.weightedAverageCost || 0),
            FormattingService.formatCurrency(row.totalAssetValue || 0),
          ]
        })

        foot = [[
          'Total / Summary',
          '',
          FormattingService.formatQuantity(totalCap),
          FormattingService.formatQuantity(totalStock),
          '',
          FormattingService.formatCurrency(totalVal),
        ]]

        columnStyles = {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        }
        break
      }

      case 'profit_analysis': {
        headers = [
          'Rank',
          'Customer Entity Name',
          'Total Volume',
          'Total Revenue Invoiced',
          'Gross Margin Profit',
        ]

        let totalVol = 0
        let totalRev = 0
        let totalProf = 0

        body = data.map((row) => {
          totalVol += row.quantity || 0
          totalRev += row.revenue || 0
          totalProf += row.profit || 0

          return [
            row.rank || '-',
            row.entity || '-',
            FormattingService.formatQuantity(row.quantity || 0),
            FormattingService.formatCurrency(row.revenue || 0),
            FormattingService.formatCurrency(row.profit || 0),
          ]
        })

        foot = [[
          'Summary Total',
          '',
          FormattingService.formatQuantity(totalVol),
          FormattingService.formatCurrency(totalRev),
          FormattingService.formatCurrency(totalProf),
        ]]

        columnStyles = {
          0: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
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

    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight()
    const totalPagesExp = '{total_pages_count_string}'

    let startY = 35

    if (options.partyName) {
      startY = 40
    }

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
      margin: { top: 35, right: 15, bottom: 20, left: 15 },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        overflow: 'linebreak',
        font: 'helvetica',
      },
      headStyles: {
        fillColor: [37, 99, 235], // Professional Blue theme
        textColor: 255,
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [243, 244, 246], // Gray 100 theme
        textColor: 31,
        fontStyle: 'bold',
      },
      columnStyles: columnStyles,
      theme: 'grid',
      didDrawPage: (data) => {
        // Draw repeating header
        doc.setFontSize(14)
        doc.setTextColor(31, 41, 55) // Gray 800
        doc.setFont('helvetica', 'bold')
        doc.text(companyName, 15, 12)

        doc.setFontSize(11)
        doc.text(reportTitle, 15, 18)

        if (options.partyName) {
          doc.setFontSize(9.5)
          doc.text(`Party Name: ${options.partyName}`, 15, 23)
        }

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(107, 114, 128) // Gray 500
        
        const metaY = options.partyName ? 28 : 24
        doc.text(`Date Range: ${dateRange}`, 15, metaY)
        doc.text(`Generated On: ${generatedTimestamp}`, pageWidth - 75, metaY)
        if (options.operator) {
          doc.text(`Generated By: ${options.operator}`, pageWidth - 75, metaY - 5)
        }

        // Divider
        doc.setDrawColor(229, 231, 235) // Gray 200
        doc.setLineWidth(0.3)
        doc.line(15, metaY + 3, pageWidth - 15, metaY + 3)

        // Draw repeating footer
        doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15)
        doc.setFontSize(8)
        doc.text('Confidential - Malak Enterprise Diesel Management system', 15, pageHeight - 9)
        doc.text(`Page ${data.pageNumber} of ${totalPagesExp}`, pageWidth - 35, pageHeight - 9)
      },
    })

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
        return 'Purchases Ledger Register'
      case 'sales_register':
        return 'Sales Ledger Register'
      case 'transfer_register':
        return 'Diesel Transfers Ledger Register'
      case 'inventory_valuation':
        return 'Diesel Stock Inventory Valuation'
      case 'profit_analysis':
        return 'Profitability Margins Analysis Report'
      default:
        return 'Diesel General Report Statement'
    }
  }
}
