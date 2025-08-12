import { JobsOptions } from "bullmq";
import { Surreal } from "surrealdb";
import { dhis2Queue, setDatabaseConnection } from "./alma-queue";
import { Schedule, ScheduleStatus } from "./interfaces";
import { scheduleService } from "./schedule-service";
import { webSocketService } from "./websocket-service";
import { authService } from "./auth-service";

export class Scheduler {
    private systemDb?: Surreal;

    async initialize() {
        const authResponse = await authService.login({
            username: "admin",
            password: "admin123",
        });
        this.systemDb = await authService.createAuthenticatedConnection(
            authResponse.token,
        );
        
        // Set the database connection for the worker
        setDatabaseConnection(this.systemDb);
        
        await this.restoreActiveSchedules();
        // Set up periodic cleanup of old completed/failed jobs
        this.setupPeriodicCleanup();
    }

    async createSchedule(scheduleData: Schedule) {
        const schedule = await scheduleService.createSchedule(
            scheduleData,
            this.systemDb!,
        );
        return schedule;
    }

    async updateSchedule(id: string, updates: Partial<Schedule>) {
        const schedule = await scheduleService.updateSchedule(
            id,
            updates,
            this.systemDb!,
        );
        return schedule;
    }

    async startSchedule(id: string) {
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }

        if (!schedule.processor && !schedule.data?.processor) {
            throw new Error(`Schedule ${id} is missing processor information`);
        }
        await scheduleService.updateScheduleProgress(id, 0, this.systemDb!);
        await scheduleService.updateScheduleStatus(
            id,
            "idle",
            "Ready to start",
            this.systemDb!,
        );
        await scheduleService.activateSchedule(id, this.systemDb!);
        const updatedSchedule = await scheduleService.getSchedule(
            id,
            this.systemDb!,
        );
        webSocketService.broadcastProgress(id, 0, "Starting job...");
        const job = await this.setupJob(updatedSchedule!);
        console.log(`✅ Schedule ${id} started with job ID: ${job.id}`);

        return updatedSchedule!;
    }

    async stopSchedule(id: string) {
        console.log(`🛑 Stopping schedule: ${id}`);
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }
        const cancelled = await dhis2Queue.remove(id);
        console.log(`🔄 Job cancellation result for ${id}: ${cancelled}`);
        const stoppedSchedule = await scheduleService.deactivateSchedule(
            id,
            this.systemDb!,
        );
        console.log(`✅ Schedule ${id} stopped and deactivated`);

        return stoppedSchedule;
    }

    async deleteSchedule(id: string) {
        console.log(`🗑️ Deleting schedule: ${id}`);

        try {
            await this.stopSchedule(id);
            try {
                const existingJob = await dhis2Queue.getJob(id);
                if (existingJob) {
                    console.log(
                        `🔄 Found existing job ${existingJob.id} for schedule ${id}, attempting removal...`,
                    );

                    const jobState = await existingJob.getState();
                    if (
                        jobState === "completed" ||
                        jobState === "failed" ||
                        jobState === "waiting"
                    ) {
                        await existingJob.remove();
                        console.log(
                            `✅ Job ${existingJob.id} removed successfully`,
                        );
                    } else {
                        console.log(
                            `⚠️ Job ${existingJob.id} is ${jobState}, skipping removal to avoid lock conflicts`,
                        );
                    }
                }
            } catch (jobError) {
                const errorMessage =
                    jobError instanceof Error
                        ? jobError.message
                        : String(jobError);
                console.warn(
                    `⚠️ Could not remove job for schedule ${id}:`,
                    errorMessage,
                );
            }

            const deleted = await scheduleService.deleteSchedule(
                id,
                this.systemDb!,
            );

            if (deleted) {
                console.log(
                    `✅ Schedule ${id} deleted successfully from database`,
                );
                return true;
            } else {
                console.error(
                    `❌ Failed to delete schedule ${id} from database`,
                );
                return false;
            }
        } catch (error) {
            console.error(`❌ Error deleting schedule ${id}:`, error);
            throw error;
        }
    }

    private async setupJob(schedule: Schedule) {
        await dhis2Queue.remove(schedule.id);
        const jobData = {
            processor: schedule.processor || "dhis2-alma-sync",
            dhis2Instance:
                schedule.data?.dhis2Instance || schedule.dhis2Instance || "",
            almaInstance:
                schedule.data?.almaInstance || schedule.almaInstance || "",
            scorecard: schedule.data?.scorecard || schedule.scorecard || 0,
            indicatorGroup:
                schedule.data?.indicatorGroup || schedule.indicatorGroup || "",
            periodType:
                schedule.data?.periodType || schedule.periodType || "monthly",
            period: schedule.data?.periods || [],
            runFor: schedule.data?.runFor || "current",
            ...(schedule.data || {}),
            scheduleId: schedule.id,
        };

        const jobOptions: JobsOptions = {
            removeOnComplete: false,
            removeOnFail: false,
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

        const job = await dhis2Queue.add(schedule.name, jobData, jobOptions);

        if (job.id) {
            await scheduleService.setScheduleJobId(
                schedule.id,
                job.id,
                this.systemDb!,
            );
        }

        return job;
    }

    private async restoreActiveSchedules() {
        const activeSchedules = await scheduleService.getActiveSchedules(
            this.systemDb!,
        );

        for (const schedule of activeSchedules) {
            if (schedule.type === "recurring" && schedule.cronExpression) {
                await this.setupJob(schedule);
            } else if (schedule.status === "running") {
                await this.recoverRunningSchedule(schedule);
            } else if (
                schedule.status === "idle" &&
                schedule.type !== "recurring"
            ) {
                await this.setupJob(schedule);
            }
        }
        await this.cleanupOrphanedJobs(activeSchedules);
    }

    private async recoverRunningSchedule(schedule: Schedule) {
      
        if (schedule.currentJobId) {
            const job = await dhis2Queue.getJob(schedule.currentJobId);
            if (job) {
                const jobState = await job.getState();
                if (
                    jobState === "active" ||
                    jobState === "waiting" ||
                    jobState === "delayed"
                ) {
                    console.log(
                        `✅ Job ${schedule.currentJobId} is still ${jobState}, keeping it`,
                    );
                    return;
                } else if (jobState === "completed") {
                    await scheduleService.updateScheduleStatus(
                        schedule.id,
                        "completed",
                        "Job completed during server restart",
                        this.systemDb!,
                    );
                    return;
                } else if (jobState === "failed") {
                    await scheduleService.updateScheduleStatus(
                        schedule.id,
                        "failed",
                        "Job failed during server restart",
                        this.systemDb!,
                    );
                    return;
                }
            }
        }

        await scheduleService.updateScheduleStatus(
            schedule.id,
            "idle",
            "Job lost during server restart, ready to restart",
            this.systemDb!,
        );
        await scheduleService.updateScheduleProgress(
            schedule.id,
            0,
            this.systemDb!,
        );
        if (schedule.type === "recurring" || schedule.type === "immediate") {
            await this.setupJob(schedule);
        }
    }

    private async cleanupOrphanedJobs(activeSchedules: Schedule[]) {
        try {
            const activeScheduleIds = new Set(activeSchedules.map((s) => s.id));
            const allJobs = await dhis2Queue.getJobs([
                "waiting",
                "active",
                "delayed",
                "completed",
                "failed",
            ]);

            for (const job of allJobs) {
                const scheduleId = job.data?.scheduleId || job.opts?.jobId;
                if (scheduleId && !activeScheduleIds.has(scheduleId)) {
                    console.log(
                        `🧹 Cleaning up orphaned job: ${job.id} for schedule: ${scheduleId}`,
                    );
                    await job.remove();
                }
            }
        } catch (error) {
            console.error("Error cleaning up orphaned jobs:", error);
        }
    }

    private setupPeriodicCleanup() {
        setInterval(async () => {
            try {
                await this.cleanupOldJobs();
            } catch (error) {
                console.error("Error during periodic cleanup:", error);
            }
        }, 30 * 60 * 1000);
    }

    private async cleanupOldJobs() {
        try {
            const completedJobs = await dhis2Queue.getJobs(["completed"]);
            const failedJobs = await dhis2Queue.getJobs(["failed"]);

            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000;
            for (const job of [...completedJobs, ...failedJobs]) {
                if (job.finishedOn && now - job.finishedOn > maxAge) {
                    await job.remove();
                }
            }

            console.log(
                `🧹 Cleaned up ${
                    completedJobs.length + failedJobs.length
                } old jobs`,
            );
        } catch (error) {
            console.error("Error cleaning up old jobs:", error);
        }
    }

    async getScheduleStatus(id: string) {
        const schedule = await scheduleService.getSchedule(id, this.systemDb!);
        if (!schedule) {
            throw new Error(`Schedule ${id} not found`);
        }

        let jobStatus = null;
        if (schedule.currentJobId) {
            const job = await dhis2Queue.getJob(schedule.currentJobId);
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
        return await scheduleService.getSchedulesByStatus(
            status,
            this.systemDb!,
        );
    }

    async getQueueStats() {
        const waiting = await dhis2Queue.getWaiting();
        const active = await dhis2Queue.getActive();
        const completed = await dhis2Queue.getCompleted();
        const failed = await dhis2Queue.getFailed();
        const delayed = await dhis2Queue.getDelayed();

        return {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            total:
                waiting.length +
                active.length +
                completed.length +
                failed.length +
                delayed.length,
        };
    }

    async shutdown() {
        await dhis2Queue.close();
        if (this.systemDb) {
            await this.systemDb.close();
        }
        await scheduleService.disconnect();
    }
}

export const scheduler = new Scheduler();
