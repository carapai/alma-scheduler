import { Job, JobProgress, JobsOptions, JobType, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { JobRequest } from "./utils";

const redisConfig = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};
export class UnifiedQueue<JobData extends Record<string, any>, JobDataResult> {
    private queue: Queue<JobData, JobDataResult>;
    private worker?: Worker<JobData, JobDataResult>;
    private processorMap: Map<
        string,
        (job: Job<JobData, JobDataResult>) => Promise<JobDataResult>
    > = new Map();
    private queueName: string;
    /**
     * Creates a new UnifiedQueue instance
     *
     * @param queueName Name of the queue
     * @param defaultJobOptions Default options for all jobs
     */
    constructor(queueName: string, defaultJobOptions: JobsOptions) {
        this.queueName = queueName;
        const connection = new IORedis(redisConfig);
        this.queue = new Queue<JobData, JobDataResult, string>(queueName, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 0,
                },
                removeOnComplete: true,
                removeOnFail: true,
                ...defaultJobOptions,
            },
        });
    }

    /**
     * Add a job to the queue for immediate or scheduled processing
     *
     * @param jobName Name of the job (used to determine which processor to use)
     * @param data Job data/payload
     * @param options Job options including scheduling
     * @returns The created job
     */
    async addJob({ jobOptions = {}, jobName, data }: JobRequest) {
        const job = await this.queue.add(
            jobName as any,
            data as any,
            jobOptions,
        );
        return job;
    }

    /**
     * Register a processor for a specific job type
     *
     * @param jobName Name of the job
     * @param processor Function to process the job
     */
    registerProcessor(
        jobName: string,
        processor: (
            job: Job<JobData, JobDataResult, string>,
        ) => Promise<JobDataResult>,
    ): void {
        this.processorMap.set(jobName, processor);
    }

    /**
     * Start processing jobs with the registered processors
     *
     * @param concurrency Number of jobs to process concurrently
     * @returns The created worker
     */
    startProcessing(
        concurrency: number = 1,
    ): Worker<JobData, JobDataResult, string> {
        if (this.worker) {
            return this.worker;
        }
        const mainProcessor = async (
            job: Job<JobData, JobDataResult, string>,
        ) => {
            try {
                const processor = this.processorMap.get(job.name);
                if (!processor) {
                    throw new Error(
                        `No processor registered for job type '${job.name}'`,
                    );
                }

                return await processor(job);
            } catch (error) {
                throw error;
            }
        };
        const connection = new IORedis(redisConfig);
        this.worker = new Worker<JobData, JobDataResult, string>(
            this.queueName,
            mainProcessor,
            {
                connection,
                concurrency,
                autorun: true,
            },
        );
        this.worker.on("completed", (job, result) => {
            console.log(`✅ Job ${job.id} completed successfully`);
        });

        this.worker.on("failed", (job, error) => {
            console.error(`❌ Job ${job?.id} failed:`, error.message);
        });

        this.worker.on("error", (error) => {
            console.error("🚨 Worker error:", error);
        });

        this.worker.on("active", (job) => {
            console.log(`🔄 Job ${job.id} started processing`);
        });

        this.worker.on("ready", () => {
            console.log("✅ Worker is ready");
        });

        this.worker.on("stalled", (jobId) => {
            console.warn(`⚠️ Job ${jobId} stalled`);
        });
        return this.worker;
    }

    /**
     * Stop processing jobs
     */
    async stopProcessing(): Promise<void> {
        if (this.worker) {
            await this.worker.close();
            this.worker = undefined;
        }
    }

    /**
     * Cancel a job by ID
     *
     * @param jobId ID of the job to cancel
     * @returns Whether the job was successfully canceled
     */
    async cancelJob(jobId: string): Promise<boolean> {
        const job = await this.queue.getJob(jobId);
        if (!job) {
            return false;
        }

        const repeatJobKey = job.repeatJobKey;
        if (repeatJobKey) {
            await this.queue.removeJobScheduler(repeatJobKey);
        }
        await job.remove();
        return true;
    }

    /**
     * Get a job by ID
     *
     * @param jobId ID of the job
     * @returns The job if found, null otherwise
     */
    async getJob(jobId: string) {
        return await this.queue.getJob(jobId);
    }

    /**
     * Get all jobs with the given statuses
     *
     * @param statuses Job statuses to include
     * @returns Jobs matching the statuses
     */
    async getJobs(
        statuses: JobType[] = [
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
            "paused",
            "prioritized",
            "wait",
            "repeat",
            "waiting-children",
        ],
    ) {
        return await this.queue.getJobs(statuses);
    }

    /**
     * Get all repeatable (cron) jobs
     *
     * @returns Repeatable jobs
     */
    async getRepeatableJobs() {
        return await this.queue.getJobSchedulers();
    }
    async getRepeatableJob(id: string) {
        return await this.queue.getJobScheduler(id);
    }

    /**
     * Update a repeatable job's schedule
     *
     * @param repeatJobKey Key of the repeatable job
     * @param newCron New cron expression
     * @param newTimezone New timezone (optional)
     * @returns Whether the job was updated successfully
     */
    async updateJob(jobId: string, jobRequest: JobRequest) {
        try {
            const job = await this.queue.getJob(jobId);
            if (job && job.repeatJobKey) {
                await this.queue.removeJobScheduler(jobId);
            } else {
                await this.queue.remove(jobId);
            }
            const updatedJob = await this.queue.add(
                jobRequest.jobName as any,
                jobRequest.data as any,
                jobRequest.jobOptions,
            );
            return updatedJob;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Pause the queue (stop processing new jobs)
     */
    async pause() {
        await this.queue.pause();
    }

    /**
     * Resume the queue (continue processing jobs)
     */
    async resume() {
        await this.queue.resume();
    }

    /**
     * Close the queue and worker connections
     */
    async close() {
        if (this.worker) {
            await this.worker.close();
        }
        await this.queue.close();
    }

    /**
     * Pause a specific repeatable job by its key
     * @param repeatJobKey The repeat key of the job
     * @returns Success status
     */
    async pauseRepeatableJob(repeatJobKey: string): Promise<boolean> {
        try {
            const repeatableJobs = await this.queue.getJobSchedulers();
            const jobToPause = repeatableJobs.find(
                (job) => job.key === repeatJobKey,
            );

            if (!jobToPause) {
                return false;
            }

            const connection = await this.queue.client;
            await connection.set(
                `paused:${repeatJobKey}`,
                JSON.stringify({
                    jobToPause,
                    pausedAt: new Date().toISOString(),
                }),
                "EX",
                60 * 60 * 24 * 30,
            );
            // Remove the repeatable job
            await this.queue.removeJobScheduler(repeatJobKey);

            // Store the paused job configuration in Redis for later resuming
            // Using the queue connection to store metadata

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Resume a previously paused repeatable job
     * @param repeatJobKey The repeat key of the job
     * @returns Success status
     */
    async resumeRepeatableJob(repeatJobKey: string) {
        try {
            const connection = await this.queue.client;
            const pausedJobJSON = await connection.get(
                `paused:${repeatJobKey}`,
            );
            if (!pausedJobJSON) {
                return false;
            }
            const pausedJob = JSON.parse(pausedJobJSON);
            await this.addJob(pausedJob);
            return await connection.del(`paused:${repeatJobKey}`);
        } catch (error) {
            return false;
        }
    }

    /**
     * Update progress for a specific job
     * @param jobId ID of the job
     * @param progress Progress value (0-100) or object with additional details
     * @returns Success status
     */
    async updateJobProgress(
        jobId: string,
        progress: number | object,
    ): Promise<boolean> {
        try {
            const job = await this.queue.getJob(jobId);

            if (!job) {
                return false;
            }

            // Update job progress
            await job.updateProgress(progress);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the current progress of a job
     * @param jobId ID of the job
     * @returns Current progress or null if job not found
     */
    async getJobProgress(jobId: string): Promise<any> {
        try {
            const job = await this.queue.getJob(jobId);

            if (!job) {
                return null;
            }

            return job.progress;
        } catch (error) {
            return null;
        }
    }

    /**
     * Create a processor wrapper that handles progress tracking
     * @param processor Original job processor
     * @returns Wrapped processor with progress tracking
     */
    createProgressTrackingProcessor<T, R>(
        processor: (
            job: Job<T>,
            updateProgress: (progress: JobProgress) => Promise<void>,
        ) => Promise<R>,
    ): (job: Job<T>) => Promise<R> {
        return async (job: Job<T>) => {
            const updateProgress = async (progress: JobProgress) => {
                await job.updateProgress(progress);
            };
            await updateProgress(0);
            try {
                const result = await processor(job, updateProgress);
                if (job.progress !== 100) {
                    await updateProgress(100);
                }
                return result;
            } catch (error) {
                throw error;
            }
        };
    }
    getProcessors() {
        return Array.from(this.processorMap.keys());
    }

    /**
     * Get queue statistics for monitoring
     */
    async getQueueStats() {
        try {
            const waiting = await this.queue.getWaiting();
            const active = await this.queue.getActive();
            const completed = await this.queue.getCompleted();
            const failed = await this.queue.getFailed();
            const delayed = await this.queue.getDelayed();
            
            return {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length,
                delayed: delayed.length,
                total: waiting.length + active.length + completed.length + failed.length + delayed.length
            };
        } catch (error) {
            console.error('Error getting queue stats:', error);
            return null;
        }
    }

    /**
     * Get detailed job information by schedule ID
     */
    async getJobByScheduleId(scheduleId: string) {
        try {
            const allJobs = await this.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
            return allJobs.find(job => 
                job.data?.scheduleId === scheduleId || 
                job.opts?.jobId === scheduleId
            );
        } catch (error) {
            console.error('Error finding job by schedule ID:', error);
            return null;
        }
    }
}
