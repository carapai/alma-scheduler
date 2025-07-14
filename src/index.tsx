import { UnifiedQueue } from "@/unified-queue";
import { JobRequest, queryDHIS2 } from "@/utils";
import { serve } from "bun";
import { RecordId, Surreal } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import index from "./index.html";

const jobQueue = new UnifiedQueue<Record<string, any>, Record<string, any>>(
    "api-jobs",
    {},
);
jobQueue.registerProcessor(
    "alma-dhis2",
    jobQueue.createProgressTrackingProcessor(async (job, updateProgress) => {
        const jobData = job.data;
        await queryDHIS2(jobData, updateProgress);
				console.log(job.id);
        
				await db.connect("surrealkv://scheduler", {
            database: "scheduler",
            namespace: "scheduler",
        });


        // const jobRequest = await db.select<JobRequest>(
        //     new RecordId("jobs", req.params.id),
        // );

        // const updatedJob = {
        //     ...jobRequest,
        //     isActive: false,
        //     status: "running",
        // };
        return { success: true, result: "Task completed" };
    }),
);
jobQueue.startProcessing(4);

const db = new Surreal({
    engines: surrealdbNodeEngines(),
});
const server = serve({
    port: 3003,
    routes: {
        "/*": index,
        "/api/processors": {
            async GET() {
                return Response.json(
                    {
                        success: true,
                        processors: jobQueue.getProcessors(),
                    },
                    { status: 200 },
                );
            },
        },
        "/api/instances": {
            async GET() {
                const file = Bun.file("configuration.json");
                const {
                    "dhis2-instances": dhisInstances,
                    "alma-instances": almaInstances,
                }: {
                    "dhis2-instances": Record<
                        string,
                        { username: string; password: string }
                    >;
                    "alma-instances": Record<
                        string,
                        { username: string; password: string; backend: string }
                    >;
                } = await file.json();
                return Response.json(
                    {
                        success: true,
                        dhis2Instances: Object.keys(dhisInstances),
                        almaInstances: Object.keys(almaInstances),
                    },
                    { status: 200 },
                );
            },
        },
        "/api/jobs": {
            async GET() {
                try {
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    const [jobs] = await db.query<[JobRequest[]]>(
                        "select * from jobs",
                    );
                    const realJobs = await jobQueue.getJobs();
                    const fullJobs = jobs.map((job) => {
                        const id = job.id as unknown as RecordId;
                        const currentJob = realJobs.find(
                            (j) => j?.id === id.id,
                        );
                        let updatedJob = {
                            ...job,
                            id: id.id,
                        };
                        if (currentJob) {
                            updatedJob.progress = String(currentJob.progress);
                        }
                        return updatedJob;
                    });
                    return Response.json(
                        {
                            success: true,
                            count: jobs.length,
                            jobs: fullJobs,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
            async POST(req: {
                json: () => JobRequest | PromiseLike<JobRequest>;
            }) {
                try {
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    const jobRequest = await req.json();
                    const [job] = await db.insert<JobRequest>(
                        "jobs",
                        jobRequest,
                    );
                    return Response.json(
                        {
                            success: true,
                            job: { ...job, id: job.id.id },
                        },
                        { status: 201 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
        },
        "/api/jobs/:id": {
            async GET(req: { params: { id: string } }) {
                try {
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    const job = await db.select<JobRequest>(
                        new RecordId("jobs", req.params.id),
                    );
                    return Response.json(
                        {
                            success: true,
                            job,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
            async DELETE(req: { params: { id: string } }) {
                try {
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    await jobQueue.cancelJob(req.params.id);
                    await db.delete(new RecordId("jobs", req.params.id));
                    return Response.json(
                        {
                            success: true,
                            message: "Job canceled and deleted successfully",
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
            async PUT(req: {
                params: { id: string };
                json: () => JobRequest | PromiseLike<JobRequest>;
            }) {
                const jobRequest = await req.json();

                await db.connect("surrealkv://scheduler", {
                    database: "scheduler",
                    namespace: "scheduler",
                });
                const update = await db.update<JobRequest>(
                    new RecordId("jobs", req.params.id),
                    jobRequest,
                );
                await db.close();
                return Response.json(
                    {
                        success: true,
                        job: { ...update, id: update.id.id },
                    },
                    { status: 200 },
                );
            },
        },
        "/api/jobs/:id/start": {
            async POST(req: {
                params: { id: string };
                json: () => JobRequest | PromiseLike<JobRequest>;
            }) {
                try {
                    const jobRequest = await req.json();
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    await jobQueue.addJob(jobRequest);

                    const updatedJob = {
                        ...jobRequest,
                        isActive: false,
                        status: "running",
                    };

                    await db.update(
                        new RecordId("jobs", req.params.id),
                        updatedJob,
                    );
                    return Response.json(
                        {
                            success: true,
                            job: updatedJob,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
        },

        "/api/jobs/:id/stop": {
            async POST(req: {
                params: { id: string };
                json: () => JobRequest | PromiseLike<JobRequest>;
            }) {
                try {
                    const jobRequest = await req.json();
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });

                    await jobQueue.cancelJob(req.params.id);

                    const updatedJob = {
                        ...jobRequest,
                        isActive: false,
                        status: "idle",
                    };
                    await db.update(
                        new RecordId("jobs", req.params.id),
                        updatedJob,
                    );
                    return Response.json(
                        {
                            success: true,
                            job: updatedJob,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
        },
        "/api/jobs/:id/delete": {
            async DELETE(req: { params: { id: string } }) {
                try {
                    await db.connect("surrealkv://scheduler", {
                        database: "scheduler",
                        namespace: "scheduler",
                    });
                    await db.delete(req.params.id);
                    return Response.json(
                        {
                            success: true,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    return Response.json(
                        {
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        { status: 500 },
                    );
                } finally {
                    await db.close();
                }
            },
        },
    },
    development: process.env.NODE_ENV !== "production",
});
console.log(`🚀 Server running at ${server.url}`);
