// drizzle.config.ts (ESM)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema-pg.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@localhost:5432/pmo',
  },
});
