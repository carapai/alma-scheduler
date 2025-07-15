import { RecordId } from "surrealdb";

export type PeriodType =
    | "quarterly"
    | "monthly"
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";
export type ScheduleType = "immediate" | "recurring" | "one-time";
export type ScheduleStatus =
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "paused";

export interface RetryConfig {
    maxAttempts: number;
    delaySeconds: number;
}

export interface Schedule {
    id: string;
    name: string;
    type: ScheduleType;
    cronExpression?: string;
    isActive: boolean;
    runImmediately: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastRun?: Date;
    nextRun?: Date | undefined | null;
    progress?: number;
    status: ScheduleStatus;
    lastStatus?: string;
    currentJobId?: string;
    retryAttempts?: number;
    maxRetries: number;
    retryDelay: number;
    scorecard: number;
    message?: string;
    indicatorGroup: string;
    periodType: PeriodType;
    dhis2Instance: string;
    almaInstance: string;
    processor: string;
    data: Record<string, any>;
}

export interface ProgressUpdate {
    scheduleId: string;
    progress: number;
    status: "idle" | "running" | "completed" | "failed";
    message?: string;
    timestamp: Date;
}

export type ISchedule = Omit<Schedule, "id"> & {
    id: RecordId<"schedules">;
};
