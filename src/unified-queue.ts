import { Queue, Worker, Job, JobsOptions, JobType, JobProgress } from "bullmq";
import IORedis from "ioredis";
import { isEmpty } from "lodash";
import { v4 as uuidv4 } from "uuid";
import { JobRequest } from "./utils";

// Redis connection configuration
const redisConfig = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
};

/**
 * Unified Queue System that combines both immediate and scheduled job processing
 */
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
                    delay: 1000,
                },
                removeOnComplete: 100,
                removeOnFail: 100,
                ...defaultJobOptions,
            },
        });
        console.log(`Queue '${queueName}' initialized`);
    }

    /**
     * Add a job to the queue for immediate or scheduled processing
     *
     * @param jobName Name of the job (used to determine which processor to use)
     * @param data Job data/payload
     * @param options Job options including scheduling
     * @returns The created job
     */
    async addJob({ jobOptions = {}, jobName, data, id, ...rest }: JobRequest) {
        const jobId = id;
        console.log(`Adding job '${jobName}' with jobOptions:`, jobOptions);
        if (
            data["schedule"] &&
            jobOptions.repeat &&
            !isEmpty(data["schedule"])
        ) {
            jobOptions.repeat.pattern = [
                data["schedule"]["minutes"],
                data["schedule"]["hours"],
                data["schedule"]["days"],
                data["schedule"]["months"],
                data["schedule"]["daysOfWeek"],
            ]
                .flat()
                .join(" ");
        }

        const job = await this.queue.add(jobName as any, data as any, {
            ...jobOptions,
            jobId,
            removeOnComplete: true,
            removeOnFail: true,
        });
        console.log(job.asJSON());
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
        console.log(`Registered processor for job type '${jobName}'`);
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
        // Don't create a new worker if one exists
        if (this.worker) {
            console.log("Worker already running");
            return this.worker;
        }
        const mainProcessor = async (
            job: Job<JobData, JobDataResult, string>,
        ) => {
            try {
                console.log(`Processing job ${job.id} of type '${job.name}'`);
                const processor = this.processorMap.get(job.data.processor);
                if (!processor) {
                    throw new Error(
                        `No processor registered for job type '${job.name}'`,
                    );
                }

                return await processor(job);
            } catch (error) {
                console.error(`Error processing job ${job.id}:`, error);
                throw error; // Re-throw for BullMQ retry handling
            }
        };

        // Create Redis connection
        const connection = new IORedis(redisConfig);

        // Create worker
        this.worker = new Worker<JobData, JobDataResult, string>(
            this.queueName,
            mainProcessor,
            {
                connection,
                concurrency,
                autorun: true,
            },
        );

        // Set up event handlers
        this.worker.on("completed", (job, result) => {
            console.log(`Job ${job.id} completed with result:`, result);
        });

        this.worker.on("failed", (job, error) => {
            console.error(`Job ${job?.id} failed with error:`, error);
        });

        this.worker.on("error", (error) => {
            console.error(`Worker error:`, error);
        });

        console.log(
            `Started worker for queue '${this.queueName}' with concurrency ${concurrency}`,
        );
        return this.worker;
    }

    /**
     * Stop processing jobs
     */
    async stopProcessing(): Promise<void> {
        if (this.worker) {
            await this.worker.close();
            this.worker = undefined;
            console.log(`Stopped worker for queue '${this.queueName}'`);
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
				console.log(job);
        if (!job) {
            return false;
        }

        // For recurring jobs, remove the repeat pattern
        const repeatJobKey = job.repeatJobKey;
        if (repeatJobKey) {
            await this.queue.removeJobScheduler(repeatJobKey);
        }

        // Remove the job
        await job.remove();
        console.log(`Canceled job ${jobId}`);
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
            console.error(`Error updating repeatable job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Pause the queue (stop processing new jobs)
     */
    async pause() {
        await this.queue.pause();
        console.log(`Paused queue '${this.queueName}'`);
    }

    /**
     * Resume the queue (continue processing jobs)
     */
    async resume() {
        await this.queue.resume();
        console.log(`Resumed queue '${this.queueName}'`);
    }

    /**
     * Close the queue and worker connections
     */
    async close() {
        if (this.worker) {
            await this.worker.close();
        }
        await this.queue.close();
        console.log(`Closed queue '${this.queueName}' and worker connections`);
    }

    /**
     * Pause a specific repeatable job by its key
     * @param repeatJobKey The repeat key of the job
     * @returns Success status
     */
    async pauseRepeatableJob(repeatJobKey: string): Promise<boolean> {
        try {
            // First, find the repeatable job
            const repeatableJobs = await this.queue.getJobSchedulers();
            const jobToPause = repeatableJobs.find(
                (job) => job.key === repeatJobKey,
            );

            if (!jobToPause) {
                console.error(
                    `Repeatable job with key ${repeatJobKey} not found`,
                );
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

            console.log(`Paused repeatable job ${repeatJobKey}`);
            return true;
        } catch (error) {
            console.error(
                `Error pausing repeatable job ${repeatJobKey}:`,
                error,
            );
            return false;
        }
    }

    /**
     * Resume a previously paused repeatable job
     * @param repeatJobKey The repeat key of the job
     * @returns Success status
     */
    async resumeRepeatableJob(repeatJobKey: string): Promise<boolean> {
        try {
            // Get the paused job configuration from Redis
            const connection = await this.queue.client;
            const pausedJobJSON = await connection.get(
                `paused:${repeatJobKey}`,
            );

            if (!pausedJobJSON) {
                console.error(`No paused job found with key ${repeatJobKey}`);
                return false;
            }
            // Parse the stored job configuration
            const pausedJob = JSON.parse(pausedJobJSON);
            // Add the job back with its original configuration
            await this.addJob(pausedJob);
            // Remove the paused job metadata
            await connection.del(`paused:${repeatJobKey}`);

            console.log(`Resumed repeatable job ${repeatJobKey}`);
            return true;
        } catch (error) {
            console.error(
                `Error resuming repeatable job ${repeatJobKey}:`,
                error,
            );
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
                console.error(`Job ${jobId} not found`);
                return false;
            }

            // Update job progress
            await job.updateProgress(progress);
            console.log(`Updated progress for job ${jobId}:`, progress);
            return true;
        } catch (error) {
            console.error(`Error updating progress for job ${jobId}:`, error);
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
                console.error(`Job ${jobId} not found`);
                return null;
            }

            return job.progress;
        } catch (error) {
            console.error(`Error getting progress for job ${jobId}:`, error);
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
            // Create a progress update helper
            const updateProgress = async (progress: JobProgress) => {
                await job.updateProgress(progress);
            };
            // Set initial progress
            await updateProgress(0);
            try {
                // Run the processor with progress tracking
                const result = await processor(job, updateProgress);
                // Set final progress if not already at 100
                if (job.progress !== 100) {
                    await updateProgress(100);
                }

                return result;
            } catch (error) {
                // Log progress error
                console.error(
                    `Error in job ${job.id} with progress tracking:`,
                    error,
                );
                throw error; // Re-throw for BullMQ retry handling
            }
        };
    }
    getProcessors() {
        return Array.from(this.processorMap.keys());
    }
}
