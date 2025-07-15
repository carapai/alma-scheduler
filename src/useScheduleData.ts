import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useCallback } from 'react';
import { scheduleDB, LocalSchedule } from './dexie-db';
import { Schedule } from './interfaces';

export function useScheduleData() {
  // Get reactive schedule data from Dexie
  const schedules = useLiveQuery(() => scheduleDB.getAllSchedules(), []);
  
  // Sync with server data
  const syncSchedules = useCallback(async (serverSchedules: Schedule[]) => {
    await scheduleDB.syncSchedules(serverSchedules);
  }, []);

  // Update progress locally
  const updateProgress = useCallback(async (id: string, progress: number, message?: string, status?: string) => {
    await scheduleDB.updateScheduleProgress(id, progress, message, status);
  }, []);

  // CRUD operations
  const upsertSchedule = useCallback(async (schedule: Schedule) => {
    await scheduleDB.upsertSchedule(schedule);
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    await scheduleDB.deleteSchedule(id);
  }, []);

  // Transform schedules to include local progress
  const enhancedSchedules = schedules?.map(schedule => ({
    ...schedule,
    // Use local progress if available and more recent, otherwise use server progress
    progress: schedule.localProgress !== undefined ? schedule.localProgress : schedule.progress,
    message: schedule.localMessage || schedule.message,
    status: schedule.localStatus || schedule.status
  })) || [];

  return {
    schedules: enhancedSchedules,
    syncSchedules,
    updateProgress,
    upsertSchedule,
    deleteSchedule,
    isLoading: schedules === undefined
  };
}

// Hook for individual schedule progress
export function useScheduleProgress(id: string) {
  const progress = useLiveQuery(() => scheduleDB.getProgress(id), [id]);
  
  return {
    progress: progress?.progress || 0,
    message: progress?.message,
    status: progress?.status,
    lastUpdated: progress?.lastUpdated
  };
}