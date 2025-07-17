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

export type UserRole = "admin" | "user" | "viewer";

export interface User {
    id: string;
    username: string;
    email: string;
    password: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastLogin?: Date;
    permissions?: string[];
}

export type IUser = Omit<User, "id"> & {
    id: RecordId<"users">;
};

export interface Session {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    userAgent?: string;
    ipAddress?: string;
}

export type ISession = Omit<Session, "id"> & {
    id: RecordId<"sessions">;
};

export interface AuthResponse {
    user: Omit<User, "password">;
    token: string;
    expiresAt: Date;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
}

export interface Permission {
    resource: string;
    action: string;
    role: UserRole;
}

export const DEFAULT_PERMISSIONS: Permission[] = [
    { resource: "schedules", action: "read", role: "viewer" },
    { resource: "schedules", action: "read", role: "user" },
    { resource: "schedules", action: "create", role: "user" },
    { resource: "schedules", action: "update", role: "user" },
    { resource: "schedules", action: "delete", role: "user" },
    { resource: "schedules", action: "start", role: "user" },
    { resource: "schedules", action: "stop", role: "user" },
    { resource: "schedules", action: "read", role: "admin" },
    { resource: "schedules", action: "create", role: "admin" },
    { resource: "schedules", action: "update", role: "admin" },
    { resource: "schedules", action: "delete", role: "admin" },
    { resource: "schedules", action: "start", role: "admin" },
    { resource: "schedules", action: "stop", role: "admin" },
    { resource: "users", action: "read", role: "admin" },
    { resource: "users", action: "create", role: "admin" },
    { resource: "users", action: "update", role: "admin" },
    { resource: "users", action: "delete", role: "admin" },
    { resource: "instances", action: "read", role: "user" },
    { resource: "instances", action: "read", role: "admin" },
    { resource: "processors", action: "read", role: "user" },
    { resource: "processors", action: "read", role: "admin" },
];
