import fs from 'fs'
import path from 'path'

type LogLevel = 'info' | 'warn' | 'error' | 'critical'

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB
const isElectronMain = typeof process !== 'undefined' && process.versions && !!process.versions.electron && (process as any).type !== 'renderer'

let logFilePath: string | null = null

export function initMainLogger(userDataPath: string) {
  if (!isElectronMain) return
  const logsDir = path.join(userDataPath, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
  logFilePath = path.join(logsDir, 'app.log')
}

function rotateLogs() {
  if (!logFilePath || !fs.existsSync(logFilePath)) return
  try {
    const stats = fs.statSync(logFilePath)
    if (stats.size > MAX_LOG_SIZE) {
      const backupPath = logFilePath + '.bak'
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
      fs.renameSync(logFilePath, backupPath)
    }
  } catch (e) {
    console.error('Failed to rotate logs:', e)
  }
}

export function writeLog(level: LogLevel, message: string, errorStack?: string) {
  const timestamp = new Date().toISOString()
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${errorStack ? `\nStack: ${errorStack}` : ''}\n`

  // 1. Write to Console
  if (level === 'error' || level === 'critical') {
    console.error(formattedMessage)
  } else if (level === 'warn') {
    console.warn(formattedMessage)
  } else {
    console.log(formattedMessage)
  }

  // 2. Write to File (if in main process)
  if (isElectronMain) {
    if (!logFilePath) {
      // Fallback path before initMainLogger is called
      const tempLogsDir = path.join(process.cwd(), 'logs')
      if (!fs.existsSync(tempLogsDir)) {
        fs.mkdirSync(tempLogsDir, { recursive: true })
      }
      logFilePath = path.join(tempLogsDir, 'app.log')
    }

    try {
      rotateLogs()
      fs.appendFileSync(logFilePath, formattedMessage, 'utf8')
    } catch (e) {
      console.error('Failed to write log to file:', e)
    }
  } else {
    // In Renderer process: try sending log to Main via IPC
    if (typeof window !== 'undefined' && (window as any).api && typeof (window as any).api.invoke === 'function') {
      (window as any).api.invoke('logger:write', { level, message, errorStack }).catch(() => {})
    }
  }
}

export const Logger = {
  info: (msg: string) => writeLog('info', msg),
  warn: (msg: string) => writeLog('warn', msg),
  error: (msg: string, err?: any) => writeLog('error', msg, err instanceof Error ? err.stack : String(err)),
  critical: (msg: string, err?: any) => writeLog('critical', msg, err instanceof Error ? err.stack : String(err)),
  getLogFilePath: () => logFilePath,
}
