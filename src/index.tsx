import { scheduler } from "@/scheduler";
import { Schedule } from "@/interfaces";
import { serve } from "bun";
import index from "./index.html";
import { webSocketService } from "./websocket-service";

// Initialize scheduler
try {
    await scheduler.initialize();
} catch (error) {
    console.error("❌ Failed to initialize scheduler:", error);
    process.exit(1);
}

const server = serve({
    port: process.env.PORT ? parseInt(process.env.PORT) : 3003,
    websocket: {
        open(ws) {
            webSocketService.addConnection(ws);
        },
        close(ws) {
            webSocketService.removeConnection(ws);
        },
        message(_ws, _message) {},
    },
    routes: {
        "/ws": {
            async GET(req) {
                const success = server.upgrade(req);
                if (!success) {
                    return new Response("Expected websocket", { status: 400 });
                }
                return undefined;
            },
        },
        "/*": index,
        "/api/processors": {
            async GET(req: Request) {
                return Response.json(
                    {
                        success: true,
                        processors: ["dhis2-alma-sync"],
                    },
                    { status: 200 },
                );
            },
        },
        "/api/queue/stats": {
            async GET(req: Request) {
                try {
                    const stats = await scheduler.getQueueStats();
                    return Response.json(
                        {
                            success: true,
                            stats,
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
                }
            },
        },
        "/api/instances": {
            async GET(req: Request) {
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
        "/api/schedules": {
            async GET(req: Request) {
                try {
                    const schedules = await scheduler.getAllSchedules();
                    return Response.json(
                        {
                            success: true,
                            count: schedules.length,
                            schedules,
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
                }
            },
            async POST(req: Request) {
                try {
                    const scheduleData = await req.json();
                    const schedule = await scheduler.createSchedule(scheduleData);
                    webSocketService.broadcastScheduleCreated(schedule);

                    return Response.json(
                        {
                            success: true,
                            schedule,
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
                }
            },
        },
        "/api/schedules/:id": {
            async GET(req: Request & { params: { id: string } }) {
                if (!req.params.id) {
                    return Response.json(
                        {
                            success: false,
                            error: "Schedule ID is required",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const scheduleStatus = await scheduler.getScheduleStatus(req.params.id);
                    if (!scheduleStatus.schedule) {
                        return Response.json(
                            {
                                success: false,
                                error: "Schedule not found",
                            },
                            { status: 404 },
                        );
                    }

                    return Response.json(
                        {
                            success: true,
                            schedule: scheduleStatus.schedule,
                            jobStatus: scheduleStatus.jobStatus,
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
                }
            },
            async DELETE(req: Request & { params: { id: string } }) {
                if (!req.params.id) {
                    return Response.json(
                        {
                            success: false,
                            error: "Schedule ID is required",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const success = await scheduler.deleteSchedule(req.params.id);

                    if (success) {
                        // Broadcast the schedule deletion
                        webSocketService.broadcastScheduleDeleted(req.params.id);

                        return Response.json(
                            {
                                success: true,
                                message: "Schedule deleted successfully",
                            },
                            { status: 200 },
                        );
                    } else {
                        return Response.json(
                            {
                                success: false,
                                error: "Schedule not found",
                            },
                            { status: 404 },
                        );
                    }
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
                }
            },
            async PUT(req: Request & { params: { id: string } }) {
                if (!req.params.id) {
                    return Response.json(
                        {
                            success: false,
                            error: "Schedule ID is required",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const updates = await req.json();
                    const schedule = await scheduler.updateSchedule(req.params.id, updates);
                    webSocketService.broadcastScheduleUpdate(schedule);

                    return Response.json(
                        {
                            success: true,
                            schedule,
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
                }
            },
        },
        "/api/schedules/:id/start": {
            async POST(req: Request & { params: { id: string } }) {
                if (!req.params.id) {
                    return Response.json(
                        {
                            success: false,
                            error: "Schedule ID is required",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const schedule = await scheduler.startSchedule(req.params.id);
                    webSocketService.broadcastScheduleStarted(schedule);
                    return Response.json(
                        {
                            success: true,
                            schedule,
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
                }
            },
        },
        "/api/schedules/:id/stop": {
            async POST(req: Request & { params: { id: string } }) {
                if (!req.params.id) {
                    return Response.json(
                        {
                            success: false,
                            error: "Schedule ID is required",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const schedule = await scheduler.stopSchedule(req.params.id);
                    webSocketService.broadcastScheduleStopped(schedule);

                    return Response.json(
                        {
                            success: true,
                            schedule,
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
                }
            },
        },
    },
    development: process.env.NODE_ENV !== "production",
});

// Graceful shutdown
process.on("SIGINT", async () => {
    await scheduler.shutdown();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await scheduler.shutdown();
    process.exit(0);
});
