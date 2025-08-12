import { Queue, Worker } from "bullmq";
import { connection } from "./redis";
import { queryDHIS2 } from "./utils";
import { webSocketService } from "./websocket-service";

export const dhis2Queue = new Queue<Record<string, any>>("dhis2", {
    connection,
});

// Export a setter function for the database connection
let systemDb: any = null;
export function setDatabaseConnection(db: any) {
    systemDb = db;
}

const worker = new Worker<Record<string, any>>(
    "dhis2",
    async (job) => {
        const scheduleId = job.data.scheduleId || job.id;
        
        if (!systemDb) {
            console.error("Database connection not available in worker");
            throw new Error("Database connection not available");
        }

        // Import scheduleService here to avoid circular dependencies
        const { scheduleService } = await import("./schedule-service");

        // Update schedule status to running
        try {
            await scheduleService.updateScheduleStatus(
                scheduleId,
                "running",
                "Job started",
                systemDb,
            );
            const runningSchedule = await scheduleService.getSchedule(scheduleId, systemDb);
            if (runningSchedule) {
                webSocketService.broadcastScheduleUpdate(runningSchedule);
            }
        } catch (error) {
            console.error("Failed to update schedule status to running:", error);
        }

        // Set up progress tracking
        const progressCallback = async (progress: any) => {
            const progressNum = typeof progress === "number" ? progress : parseFloat(String(progress)) || 0;
            
            try {
                // Update job progress
                await job.updateProgress(progressNum);
                
                // Update schedule progress in database
                await scheduleService.updateScheduleProgress(scheduleId, progressNum, systemDb);
                
                // Broadcast progress update via WebSocket
                webSocketService.broadcastProgress(
                    scheduleId,
                    progressNum,
                    `Processing... ${progressNum.toFixed(1)}%`,
                );
            } catch (error) {
                console.error("Failed to update progress:", error);
            }
        };

        try {
            // Execute the actual job
            await queryDHIS2(job.data, progressCallback);
            
            // Update schedule status to completed
            await scheduleService.updateScheduleStatus(
                scheduleId,
                "completed",
                "Job completed successfully",
                systemDb,
            );
            
            const completedSchedule = await scheduleService.getSchedule(scheduleId, systemDb);
            if (completedSchedule) {
                webSocketService.broadcastScheduleUpdate(completedSchedule);
            }
            
            return { success: true, result: "Task completed" };
        } catch (error) {
            // Update schedule status to failed
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            await scheduleService.updateScheduleStatus(
                scheduleId,
                "failed",
                errorMessage,
                systemDb,
            );
            
            const failedSchedule = await scheduleService.getSchedule(scheduleId, systemDb);
            if (failedSchedule) {
                webSocketService.broadcastScheduleUpdate(failedSchedule);
            }
            
            throw error;
        }
    },
    {
        connection,
        concurrency: 4,
    },
);

worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
    console.log(`❌ Job ${job?.id} has failed with ${err.message}`);
});

worker.on("progress", (job, progress) => {
    console.log(`📊 Job ${job.id} progress: ${progress}%`);
});
