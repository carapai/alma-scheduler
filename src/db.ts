import { Database } from "bun:sqlite";

export const db = new Database("schedules.db");

// ==================== Database Functions ====================
export function initializeDatabase() {
    db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cronExpression TEXT NOT NULL,
      isActive INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastRun TEXT,
      nextRun TEXT,
      lastStatus TEXT,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      retryAttempts INTEGER DEFAULT 0,
      maxRetries INTEGER DEFAULT 3,
      retryDelay INTEGER DEFAULT 60,
      message TEXT,
			scorecard INTEGER DEFAULT 0,
			periodType TEXT,
			indicatorGroup TEXT
    )
  `);
}
