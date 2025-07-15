import { scheduler } from "@/scheduler";
import { Schedule } from "@/interfaces";
import { serve } from "bun";
import index from "./index.html";
import { webSocketService } from "./websocket-service";

// Initialize scheduler
try {
    await scheduler.initialize();
    console.log("✅ Scheduler initialized successfully");
} catch (error) {
    console.error("❌ Failed to initialize scheduler:", error);
    process.exit(1);
}

const server = serve({
    port: 3003,
    websocket: {
        open(ws) {
            webSocketService.addConnection(ws);
        },
        close(ws) {
            webSocketService.removeConnection(ws);
        },
        message(_ws, message) {
            console.log("Received WebSocket message:", message);
        },
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
            async GET() {
                return Response.json(
                    {
                        success: true,
                        processors: ["dhis2-alma-sync"],
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
        "/api/schedules": {
            async GET() {
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
            async POST(req: { json: () => Schedule | PromiseLike<Schedule> }) {
                try {
                    const scheduleData = await req.json();
                    const schedule = await scheduler.createSchedule(
                        scheduleData,
                    );

                    // Broadcast the new schedule
                    webSocketService.broadcastScheduleCreated(schedule);

                    return Response.json(
                        {
                            success: true,
                            schedule,
                        },
                        { status: 201 },
                    );
                } catch (error) {
                    console.log(error);
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
            async GET(req: { params: { id: string } }) {
                try {
                    const status = await scheduler.getScheduleStatus(
                        req.params.id,
                    );
                    return Response.json(
                        {
                            success: true,
                            ...status,
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
            async DELETE(req: { params: { id: string } }) {
                try {
                    await scheduler.deleteSchedule(req.params.id);

                    // Broadcast the schedule deletion
                    webSocketService.broadcastScheduleDeleted(req.params.id);

                    return Response.json(
                        {
                            success: true,
                            message: "Schedule deleted successfully",
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
            async PUT(req: {
                params: { id: string };
                json: () => Partial<Schedule> | PromiseLike<Partial<Schedule>>;
            }) {
                try {
                    const updates = await req.json();
                    const schedule = await scheduler.updateSchedule(
                        req.params.id,
                        updates,
                    );
                    webSocketService.broadcastScheduleUpdate(schedule);

                    return Response.json(
                        {
                            success: true,
                            schedule,
                        },
                        { status: 200 },
                    );
                } catch (error) {
                    console.log(error);
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
            async POST(req: { params: { id: string } }) {
                try {
                    const schedule = await scheduler.startSchedule(
                        req.params.id,
                    );
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
            async POST(req: { params: { id: string } }) {
                try {
                    const schedule = await scheduler.stopSchedule(
                        req.params.id,
                    );

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

console.log(`🚀 Server running at ${server.url}`);

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    await scheduler.shutdown();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("Shutting down gracefully...");
    await scheduler.shutdown();
    process.exit(0);
});
