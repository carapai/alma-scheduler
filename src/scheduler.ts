import { JobsOptions } from "bullmq";
import { Schedule, ScheduleStatus } from "./interfaces";
import { scheduleService } from "./schedule-service";
import { UnifiedQueue } from "./unified-queue";
import { queryDHIS2 } from "./utils";
import { webSocketService } from "./websocket-service";
import { authService } from "./auth-service";
import { Surreal } from "surrealdb";

export class Scheduler {
    private jobQueue: UnifiedQueue<Record<string, any>, Record<string, any>>;
    private isInitialized = false;
    private systemDb?: Surreal;
    constructor() {
        this.jobQueue = new UnifiedQueue<
            Record<string, any>,
            Record<string, any>
        >("scheduler-jobs", {
            removeOnComplete: 10,
            removeOnFail: 10,
        });
    }

    async initialize() {
        if (this.isInitialized) return;
                const authResponse = await authService.login({
            username: "admin",
            password: "admin123"
        });
        this.systemDb = await authService.createAuthenticatedConnection(authResponse.token);
        this.jobQueue.registerProcessor(
            "dhis2-alma-sync",
            this.jobQueue.createProgressTrackingProcessor(
                async (job, updateProgress) => {
                    const scheduleId =
                        job.data.scheduleId || job.opts.jobId || "";

                    const runningSchedule =
                        await scheduleService.updateScheduleStatus(
                            scheduleId,
                            "running",
                            "Job started",
                            this.systemDb!,
                        );
                    webSocketService.broadcastScheduleUpdate(runningSchedule);
                    try {
                        const progressCallback = async (progress: any) => {
                            await updateProgress(progress);

                            const progressNum =
                                typeof progress === "number"
                                    ? progress
                                    : typeof progress === "string"
                                    ? parseFloat(progress) || 0
                                    : 0;

                            await scheduleService.updateScheduleProgress(
                                scheduleId,
                                progressNum,
                                this.systemDb!,
                            );

                            webSocketService.broadcastProgress(
                                scheduleId,
                                progressNum,
                                `Processing... ${progressNum.toFixed(1)}%`,
                            );
                        };

                        await queryDHIS2(job.data, progressCallback);

                        const completedSchedule =
                            await scheduleService.updateScheduleStatus(
                                scheduleId,
                                "completed",
                                "Job completed successfully",
                                this.systemDb!,
                            );
                        webSocketService.broadcastScheduleUpdate(
                            completedSchedule,
                        );

                        return { success: true, result: "Task completed" };
                    } catch (error) {
                        const failedSchedule =
                            await scheduleService.updateScheduleStatus(
                                scheduleId,
                                "failed",
                                error instanceof Error
                                    ? error.message
                                    : "Unknown error",
                                this.systemDb!,
                            );
                        webSocketService.broadcastScheduleUpdate(
                            failedSchedule,
                        );

                        throw error;
                    }
                },
            ),
        );

        this.jobQueue.startProcessing(4);

        await this.restoreActiveSchedules();

        this.isInitialized = true;
    }

    async createSchedule(scheduleData: Schedule) {
        const schedule = await scheduleService.createSchedule(scheduleData, this.systemDb!);
        return schedule;
    }

    async updateSchedule(id: string, updates: Partial<Schedule>) {
        const schedule = await scheduleService.updateSchedule(id, updates, this.systemDb!);
        return schedule;
    }

    async startSchedule(id: string) {
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }

        await scheduleService.updateScheduleProgress(id, 0, this.systemDb!);
        await scheduleService.updateScheduleStatus(
            id,
            "idle",
            "Ready to start",
            this.systemDb!,
        );
        const updatedSchedule = await scheduleService.getSchedule(id, this.systemDb!);
        webSocketService.broadcastProgress(id, 0, "Starting job...");

        await this.setupJob(updatedSchedule!);
        return updatedSchedule!;
    }

    async stopSchedule(id: string) {
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }

        // Cancel the appropriate job based on schedule type
        if (schedule.type === "recurring") {
            await this.jobQueue.cancelJob(`recurring-${id}`);
        } else {
            await this.jobQueue.cancelJob(id);
        }

        await scheduleService.deactivateSchedule(id, this.systemDb!);

        return schedule;
    }

    async deleteSchedule(id: string) {
        await this.stopSchedule(id);

        await scheduleService.deleteSchedule(id, this.systemDb!);

        return true;
    }

    private async setupJob(schedule: Schedule) {
        await this.jobQueue.cancelJob(schedule.id);
        const jobData = {
            processor: schedule.processor,
            dhis2Instance:
                schedule.data.dhis2Instance || schedule.dhis2Instance,
            almaInstance: schedule.data.almaInstance || schedule.almaInstance,
            scorecard: schedule.data.scorecard || schedule.scorecard,
            indicatorGroup:
                schedule.data.indicatorGroup || schedule.indicatorGroup,
            periodType: schedule.data.periodType || schedule.periodType,
            period: schedule.data.periods,
            runFor: schedule.data.runFor,
            ...schedule.data,
            scheduleId: schedule.id,
        };

        const jobOptions: JobsOptions = {
            removeOnComplete: true,
            removeOnFail: true,
        };

        if (schedule.type === "recurring" && schedule.cronExpression) {
            jobOptions.repeat = {
                pattern: schedule.cronExpression,
                immediately: schedule.runImmediately,
            };
            jobOptions.jobId = schedule.id;
            jobOptions.repeatJobKey = schedule.id;
        } else {
            jobOptions.jobId = schedule.id;
        }

        const job = await this.jobQueue.addJob({
            jobName: schedule.processor,
            data: jobData,
            jobOptions,
        });
        return job;
    }

    private async restoreActiveSchedules() {
        const activeSchedules = await scheduleService.getActiveSchedules(this.systemDb!);

        for (const schedule of activeSchedules) {
            if (schedule.type === "recurring" && schedule.cronExpression) {
                await this.setupJob(schedule);
            }
        }
    }

    async getScheduleStatus(id: string) {
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }

        let jobStatus = null;
        if (schedule.currentJobId) {
            const job = await this.jobQueue.getJob(schedule.currentJobId);
            if (job) {
                jobStatus = {
                    id: job.id,
                    progress: job.progress,
                    processedOn: job.processedOn,
                    finishedOn: job.finishedOn,
                    failedReason: job.failedReason,
                };
            }
        }

        return {
            schedule,
            jobStatus,
        };
    }

    async getAllSchedules() {
        return await scheduleService.getAllSchedules(this.systemDb!);
    }

    async getSchedulesByStatus(status: ScheduleStatus) {
        return await scheduleService.getSchedulesByStatus(status, this.systemDb!);
    }

    async shutdown() {
        await this.jobQueue.close();
        if (this.systemDb) {
            await this.systemDb.close();
        }
        await scheduleService.disconnect();
    }
}

export const scheduler = new Scheduler();
