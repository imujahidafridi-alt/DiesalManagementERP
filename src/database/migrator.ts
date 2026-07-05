import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const isElectron = typeof process !== 'undefined' && process.versions && !!process.versions.electron

export function runMigrations(): void {
  try {
    let migrationsFolder: string

    if (isElectron) {
      // In production, migrations will be bundled into the dist-electron folder
      migrationsFolder = path.join(app.getAppPath(), 'dist-electron', 'migrations')
      
      // Fallback for dev mode where getAppPath() points to project root
      if (!fs.existsSync(migrationsFolder)) {
        migrationsFolder = path.join(process.cwd(), 'src', 'database', 'migrations')
      }
    } else {
      migrationsFolder = path.join(__dirname, 'migrations')
    }

    console.log(`Running database migrations from: ${migrationsFolder}`)
    
    // Execute migrations
    migrate(db, { migrationsFolder })
    
    console.log('Database migrations completed successfully.')
  } catch (error) {
    console.error('Failed to run database migrations:', error)
    throw error;
  }
}
