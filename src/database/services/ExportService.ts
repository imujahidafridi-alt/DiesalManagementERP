import fs from 'fs'
import { sqlite } from '../db'
import { DataGridService } from './DataGridService'

export class ExportService {
  static async exportCSV(
    filePath: string,
    gridId: string,
    search: string,
    filters: Record<string, any>,
    columns: { key: string; header: string }[]
  ): Promise<void> {
    const sqlQuery = DataGridService.getSQLQuery(gridId, search, filters)
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
    
    try {
      const headersLine = columns.map(col => `"${col.header.replace(/"/g, '""')}"`).join(',')
      stream.write(headersLine + '\n')
      
      const stmt = sqlite.prepare(sqlQuery.sql)
      const iterator = stmt.iterate(...sqlQuery.params)
      
      for (const row of iterator) {
        const line = columns.map(col => {
          const val = (row as any)[col.key]
          const strVal = val !== undefined && val !== null ? String(val) : ''
          return `"${strVal.replace(/"/g, '""')}"`
        }).join(',')
        stream.write(line + '\n')
      }
    } finally {
      stream.end()
    }
  }

  static async exportExcel(
    filePath: string,
    gridId: string,
    search: string,
    filters: Record<string, any>,
    columns: { key: string; header: string }[]
  ): Promise<void> {
    const sqlQuery = DataGridService.getSQLQuery(gridId, search, filters)
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
    
    try {
      const headersLine = columns.map(col => col.header).join('\t')
      stream.write(headersLine + '\n')
      
      const stmt = sqlite.prepare(sqlQuery.sql)
      const iterator = stmt.iterate(...sqlQuery.params)
      
      for (const row of iterator) {
        const line = columns.map(col => {
          const val = (row as any)[col.key]
          const strVal = val !== undefined && val !== null ? String(val) : ''
          return strVal.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
        }).join('\t')
        stream.write(line + '\n')
      }
    } finally {
      stream.end()
    }
  }
}
