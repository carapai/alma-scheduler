import { RecordId, Surreal } from "surrealdb";
import { v4 as uuidv4 } from "uuid";
import { BaseService } from "./base-service";
import { ISchedule, Schedule, ScheduleStatus } from "./interfaces";

export class ScheduleService extends BaseService {
    protected async initializeSchema() {
        // Schema is initialized by auth-service.ts
        // No need to redefine tables here
    }

    private getDatabase(authenticatedDb: Surreal): Surreal {
        return authenticatedDb;
    }

    async createSchedule(scheduleData: Schedule, authenticatedDb: Surreal): Promise<Schedule> {
        const db = this.getDatabase(authenticatedDb);

        const now = new Date();

        const insertData: ISchedule = {
            ...scheduleData,
            id: new RecordId("schedules", scheduleData.id || uuidv4()),
            createdAt: now,
            updatedAt: now,
        };

        const [result] = await db.insert<ISchedule>(
            "schedules",
            insertData,
        );

		
        return {
            ...result,
            id: String(insertData.id.id),
        };
    }

    async updateSchedule(
        id: string,
        updates: Partial<Schedule>,
        authenticatedDb: Surreal
    ): Promise<Schedule> {
        const db = this.getDatabase(authenticatedDb);
        
        const updatedData = {
            ...updates,
            updatedAt: new Date(),
            id: new RecordId("schedules", id),
        };
        const result = await db.merge<ISchedule>(
            new RecordId("schedules", id),
            updatedData,
        );
        return {
            ...result,
            id: id,
        };
    }

    async getSchedule(id: string, authenticatedDb: Surreal): Promise<Schedule | null> {
        const db = this.getDatabase(authenticatedDb);
        
        const result = await db.select<ISchedule>(
            new RecordId("schedules", id),
        );

        return {
            ...result,
            id: id,
        };
    }

    async getAllSchedules(authenticatedDb: Surreal): Promise<Schedule[]> {
        const db = this.getDatabase(authenticatedDb);
        
        const [result] = await db.query<[ISchedule[]]>(
            "SELECT * FROM schedules ORDER BY createdAt DESC",
        );
        return result.map((schedule) => {
            return {
                ...schedule,
                id: String(schedule.id.id),
            };
        });
    }

    async getActiveSchedules(authenticatedDb: Surreal): Promise<Schedule[]> {
        const db = this.getDatabase(authenticatedDb);
        
        const [result] = await db.query<[ISchedule[]]>(
            "SELECT * FROM schedules WHERE isActive = true",
        );
        return result.map((schedule) => {
            return {
                ...schedule,
                id: String(schedule.id.id),
            };
        });
    }

    async getSchedulesByStatus(status: ScheduleStatus, authenticatedDb: Surreal): Promise<Schedule[]> {
        const db = this.getDatabase(authenticatedDb);

        const [result] = await db.query<[ISchedule[]]>(
            "SELECT * FROM schedules WHERE status = $status",
            {
                status,
            },
        );
        return result.map((schedule) => {
            return {
                ...schedule,
                id: String(schedule.id.id),
            };
        });
    }

    async deleteSchedule(id: string, authenticatedDb: Surreal): Promise<boolean> {
        const db = this.getDatabase(authenticatedDb);

        const result = await db.delete(new RecordId("schedules", id));
        return !!result;
    }

    async updateScheduleStatus(
        id: string,
        status: ScheduleStatus,
        message: string | undefined,
        authenticatedDb: Surreal
    ) {
        const db = this.getDatabase(authenticatedDb);
        
        const updates: Partial<ISchedule> = {
            status,
            lastStatus: status,
            updatedAt: new Date(),
        };

        if (message) {
            updates.message = message;
        }

        // Update lastRun when schedule completes or fails
        if (status === "completed" || status === "failed") {
            updates.lastRun = new Date();
        }

        const result = await db.merge<ISchedule>(
            new RecordId("schedules", id),
            updates,
        );

        return { ...result, id: id };
    }

    async updateScheduleProgress(
        id: string,
        progress: number,
        authenticatedDb: Surreal
    ): Promise<Schedule> {
        const db = this.getDatabase(authenticatedDb);

        const result = await db.merge<ISchedule>(
            new RecordId("schedules", id),
            {
                progress,
                updatedAt: new Date(),
            },
        );
        return { ...result, id: id };
    }

    async setScheduleJobId(id: string, jobId: string, authenticatedDb: Surreal): Promise<Schedule> {
        const db = this.getDatabase(authenticatedDb);

        const result = await db.merge<ISchedule>(
            new RecordId("schedules", id),
            {
                currentJobId: jobId,
                updatedAt: new Date(),
            },
        );
        return { ...result, id: id };
    }

    async activateSchedule(id: string, authenticatedDb: Surreal): Promise<Schedule> {
        const result = await this.updateSchedule(id, { isActive: true }, authenticatedDb);
        return result;
    }

    async deactivateSchedule(id: string, authenticatedDb: Surreal): Promise<Schedule> {
        return this.updateSchedule(id, { isActive: false, status: "idle" }, authenticatedDb);
    }
}

export const scheduleService = new ScheduleService();
