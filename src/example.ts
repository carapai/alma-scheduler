import { UnifiedQueue } from "./unified-queue";

// Create a queue instance
const jobQueue = new UnifiedQueue<Record<string, any>, Record<string, any>>(
    "unified-jobs",
    {},
);

// Define job processors
async function processEmailJob(job: any) {
    console.log(`Processing email job: ${job.id}`);
    console.log(`Sending email to: ${job.data.to}`);

    // Simulate sending email
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
        messageId: `email_${Date.now()}`,
        sentAt: new Date().toISOString(),
    };
}

async function processReportJob(job: any) {
    console.log(`Processing report job: ${job.id}`);
    console.log(`Generating report: ${job.data.reportName}`);

    // Simulate report generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
        reportUrl: `https://example.com/reports/${job.data.reportName
            .toLowerCase()
            .replace(/\s+/g, "-")}.pdf`,
        generatedAt: new Date().toISOString(),
    };
}

async function processBackupJob(job: any) {
    console.log(`Processing backup job: ${job.id}`);
    console.log(`Backing up: ${job.data.source}`);

    // Simulate backup process
    // await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
        backupId: `backup_${Date.now()}`,
        size: `${Math.floor(Math.random() * 1000)}MB`,
        completedAt: new Date().toISOString(),
    };
}

// Register processors
jobQueue.registerProcessor("sendEmail", processEmailJob);
jobQueue.registerProcessor("generateReport", processReportJob);
jobQueue.registerProcessor("backup", processBackupJob);

// Start processing jobs
jobQueue.startProcessing(4); // Process 2 jobs concurrently

// Add immediate job example
async function addImmediateJob() {
    // const job = await jobQueue.addJob(
    //     "sendEmail",
    //     {
    //         to: "user@example.com",
    //         subject: "Welcome!",
    //         body: "Thank you for signing up.",
    //     },
    //     {
    //         priority: 1, // High priority
    //         attempts: 3, // Retry up to 3 times
    //     },
    // );

    const job = await jobQueue.addJob({
        jobName: "sendEmail",
        data: {
            to: "user@example.com",
            subject: "Welcome!",
            body: "Thank you for signing up.",
        },
        jobOptions: {
            priority: 1, // High priority
            attempts: 3, // Retry up to 3 times
        },
    });

    console.log(`Added immediate job: ${job.id}`);
}

// Add delayed job example
async function addDelayedJob() {
    const job = await jobQueue.addJob({
        jobName: "generateReport",
        data: {
            reportName: "Sales Summary",
            format: "pdf",
            period: "monthly",
        },
        jobOptions: {
            delay: 60000, // Run after 1 minute
            priority: 2, // Medium priority
        },
    });

    console.log(`Added delayed job: ${job.id}`);
}

// Add scheduled job example
async function addScheduledJob() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow

    const job = await jobQueue.addJob({
        jobName: "generateReport",
        data: {
            reportName: "Inventory Status",
            format: "excel",
            detailed: true,
        },
        jobOptions: {
            attempts: 5,
            // repeat: {
            //     startDate: tomorrow,
            // },
        },
    });

    console.log(`Added scheduled job: ${job.id}`);
}

// Add recurring job example
async function addRecurringJob() {
    const job = await jobQueue.addJob({
        jobName: "backup",
        data: {
            source: "database",
            destination: "s3://backups",
            compress: true,
        },
        jobOptions: {
            repeat: { pattern: "*/1 * * * * *" },
            attempts: 5,
        },
    });

    console.log(`Added recurring job: ${job.id}`);
}

// Get jobs example
async function listJobs() {
    // const jobs = await jobQueue.getJobs(["waiting", "delayed"]);
    // console.log(`Found ${jobs.length} pending jobs:`);
    // for (const job of jobs) {
    //     const state = await job.getState();
    //     console.log(`- Job ${job.id} (${job.name}): ${state}`);
    // }
    // const repeatable = await jobQueue.getRepeatableJobs();
    // console.log(`Found ${repeatable.length} recurring jobs:`);
    // for (const job of repeatable) {
    //     console.log(
    //         `- Job ${job.id} (${job.name}): ${job.pattern}, next: ${new Date(
    //             job.next ?? "",
    //         ).toISOString()}`,
    //     );
    // }
}

// Cancel job example
async function cancelJob(jobId: string) {
    const success = await jobQueue.cancelJob(jobId);
    if (success) {
        console.log(`Successfully canceled job: ${jobId}`);
    } else {
        console.log(`Failed to cancel job: ${jobId} (not found)`);
    }
}

// Main function to run examples
async function runExamples() {
    try {
        // Add different types of jobs
        await addImmediateJob();
        await addDelayedJob();
        await addScheduledJob();
        await addRecurringJob();
        // Wait a bit
        console.log("Waiting for jobs to be processed...");
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // List jobs
        await listJobs();
        // Example: cancel the first waiting job
        const waitingJobs = await jobQueue.getJobs(["waiting"]);
        if (waitingJobs.length > 0) {
            await cancelJob(waitingJobs[0].id ?? "");
        }

        // Keep the process running
        console.log("Press Ctrl+C to exit");
    } catch (error) {
        console.error("Error in examples:", error);
    }
}

// Run examples
runExamples();

// Handle graceful shutdown
process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await jobQueue.close();
    process.exit(0);
});
