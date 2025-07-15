import { RecordId, s, Surreal } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { ISchedule, Schedule, ScheduleStatus } from "./interfaces";
import { v4 as uuidv4 } from "uuid";

export class ScheduleService {
    private db: Surreal;
    private isConnected = false;
    private isInitialized = false;

    constructor() {
        this.db = new Surreal({
            engines: surrealdbNodeEngines(),
        });
    }
    async connect() {
        if (!this.isConnected) {
            await this.db.connect("surrealkv://scheduler", {
                database: "scheduler",
                namespace: "scheduler",
            });
            this.isConnected = true;
            if (!this.isInitialized) {
                await this.initializeSchema();
                this.isInitialized = true;
            }
        }
    }

    async disconnect() {
        if (this.isConnected) {
            await this.db.close();
            this.isConnected = false;
        }
    }

    private async initializeSchema() {
        try {
            await this.db.query(`
                    DEFINE TABLE OVERWRITE schedules SCHEMALESS PERMISSIONS FULL;
                `);
        } catch (defineError) {
            console.warn(
                "Schema already defined or error during schema definition:",
                defineError,
            );
        }
    }

    async createSchedule(scheduleData: Schedule): Promise<Schedule> {
        await this.connect();

        const now = new Date();

        const insertData: ISchedule = {
            ...scheduleData,
            id: new RecordId("schedules", scheduleData.id || uuidv4()),
            createdAt: now,
            updatedAt: now,
        };

        const [result] = await this.db.insert<ISchedule>(
            "schedules",
            insertData,
        );

        return {
            ...result,
            id: String(result.id.id),
        };
    }

    async updateSchedule(
        id: string,
        updates: Partial<Schedule>,
    ): Promise<Schedule> {
        await this.connect();
        const updatedData = {
            ...updates,
            updatedAt: new Date(),
            id: new RecordId("schedules", id),
        };
        const result = await this.db.merge<ISchedule>(
            new RecordId("schedules", id),
            updatedData,
        );
        return {
            ...result,
            id: id,
        };
    }

    async getSchedule(id: string): Promise<Schedule | null> {
        await this.connect();
        const result = await this.db.select<ISchedule>(
            new RecordId("schedules", id),
        );

        return {
            ...result,
            id: id,
        };
    }

    async getAllSchedules(): Promise<Schedule[]> {
        await this.connect();
        const [result] = await this.db.query<[ISchedule[]]>(
            "SELECT * FROM schedules ORDER BY createdAt DESC",
        );
        return result.map((schedule) => {
            return {
                ...schedule,
                id: String(schedule.id.id),
            };
        });
    }

    async getActiveSchedules(): Promise<Schedule[]> {
        await this.connect();
        const [result] = await this.db.query<[ISchedule[]]>(
            "SELECT * FROM schedules WHERE isActive = true",
        );
        return result.map((schedule) => {
            return {
                ...schedule,
                id: String(schedule.id.id),
            };
        });
    }

    async getSchedulesByStatus(status: ScheduleStatus): Promise<Schedule[]> {
        await this.connect();

        const [result] = await this.db.query<[ISchedule[]]>(
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

    async deleteSchedule(id: string): Promise<boolean> {
        await this.connect();

        const result = await this.db.delete(new RecordId("schedules", id));
        return !!result;
    }

    async updateScheduleStatus(
        id: string,
        status: ScheduleStatus,
        message?: string,
    ) {
        await this.connect();
        const updates: Partial<ISchedule> = {
            status,
            lastStatus: status,
            updatedAt: new Date(),
        };

        if (message) {
            updates.message = message;
        }

        const result = await this.db.merge<ISchedule>(
            new RecordId("schedules", id),
            updates,
        );

        return { ...result, id: id };
    }

    async updateScheduleProgress(
        id: string,
        progress: number,
    ): Promise<Schedule> {
        await this.connect();

        const result = await this.db.merge<ISchedule>(
            new RecordId("schedules", id),
            {
                progress,
                updatedAt: new Date(),
            },
        );
        return { ...result, id: id };
    }

    async setScheduleJobId(id: string, jobId: string): Promise<Schedule> {
        await this.connect();

        const result = await this.db.merge<ISchedule>(
            new RecordId("schedules", id),
            {
                currentJobId: jobId,
                updatedAt: new Date(),
            },
        );
        return { ...result, id: id };
    }

    async activateSchedule(id: string): Promise<Schedule> {
        const result = await this.updateSchedule(id, { isActive: true });
        return result;
    }

    async deactivateSchedule(id: string): Promise<Schedule> {
        return this.updateSchedule(id, { isActive: false, status: "idle" });
    }
}

export const scheduleService = new ScheduleService();
