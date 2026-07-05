import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/database/schema/schema.ts',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'sqlite.db',
  },
})
