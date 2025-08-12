import Dexie, { type EntityTable } from 'dexie';
import { Schedule } from './interfaces';

export interface ScheduleProgress {
  id: string;
  progress: number;
  message?: string;
  status: string;
  lastUpdated: Date;
}

export interface LocalSchedule extends Schedule {
  localProgress?: number;
  localMessage?: string;
  localStatus?: string;
  lastProgressUpdate?: Date;
}

const db = new Dexie('SchedulerDB') as Dexie & {
  schedules: EntityTable<LocalSchedule, 'id'>;
  progress: EntityTable<ScheduleProgress, 'id'>;
};

db.version(1).stores({
  schedules: 'id, name, type, status, progress, isActive, createdAt, updatedAt',
  progress: 'id, progress, status, lastUpdated'
});

export const scheduleDB = {
  async upsertSchedule(schedule: Schedule): Promise<void> {
    await db.schedules.put({
      ...schedule,
      lastProgressUpdate: new Date()
    });
  },

  async updateScheduleProgress(id: string, progress: number, message?: string, status?: string): Promise<void> {
    const now = new Date();
    
    // Update progress table
    await db.progress.put({
      id,
      progress,
      message,
      status: status || 'running',
      lastUpdated: now
    });

    // Update schedule with local progress
    await db.schedules.update(id, {
      localProgress: progress,
      localMessage: message,
      localStatus: status,
      lastProgressUpdate: now
    });
  },

  async getSchedule(id: string): Promise<LocalSchedule | undefined> {
    return await db.schedules.get(id);
  },

  async getAllSchedules(): Promise<LocalSchedule[]> {
    return await db.schedules.toArray();
  },

  async deleteSchedule(id: string): Promise<void> {
    await db.transaction('rw', db.schedules, db.progress, async () => {
      await db.schedules.delete(id);
      await db.progress.delete(id);
    });
  },

  // Progress operations
  async getProgress(id: string): Promise<ScheduleProgress | undefined> {
    return await db.progress.get(id);
  },

  async getAllProgress(): Promise<ScheduleProgress[]> {
    return await db.progress.toArray();
  },

  // Sync operations
  async syncSchedules(serverSchedules: Schedule[]): Promise<void> {
    await db.transaction('rw', db.schedules, async () => {
      for (const schedule of serverSchedules) {
        const existing = await db.schedules.get(schedule.id);
        await db.schedules.put({
          ...schedule,
          // Preserve local progress if more recent
          localProgress: existing?.localProgress !== undefined && 
                        existing.lastProgressUpdate && 
                        existing.lastProgressUpdate > new Date(schedule.updatedAt || 0) 
                        ? existing.localProgress : schedule.progress,
          localMessage: existing?.localMessage,
          localStatus: existing?.localStatus,
          lastProgressUpdate: existing?.lastProgressUpdate
        });
      }
    });
  },

  // Clear all data
  async clearAll(): Promise<void> {
    await db.transaction('rw', db.schedules, db.progress, async () => {
      await db.schedules.clear();
      await db.progress.clear();
    });
  }
};

export default db;