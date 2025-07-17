import { scheduler } from "@/scheduler";
import { Schedule } from "@/interfaces";
import { serve } from "bun";
import index from "./index.html";
import { webSocketService } from "./websocket-service";
import { AuthRoutes } from "./auth-routes";
import { AuthMiddleware, AuthenticatedRequest } from "./auth-middleware";
import { scheduleService } from "./schedule-service";

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
        message(_ws, _message) {
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
        "/api/auth/login": {
            async POST(req: Request) {
                return AuthRoutes.handleLogin(req);
            },
        },
        "/api/auth/register": {
            async POST(req: Request) {
                return AuthRoutes.handleRegister(req);
            },
        },
        "/api/auth/logout": {
            async POST(req: AuthenticatedRequest) {
                return AuthRoutes.handleLogout(req);
            },
        },
        "/api/auth/profile": {
            async GET(req: AuthenticatedRequest) {
                return AuthRoutes.handleProfile(req);
            },
        },
        "/api/auth/change-password": {
            async POST(req: AuthenticatedRequest) {
                return AuthRoutes.handleChangePassword(req);
            },
        },
        "/api/auth/users": {
            async GET(req: AuthenticatedRequest) {
                return AuthRoutes.handleGetUsers(req);
            },
            async POST(req: AuthenticatedRequest) {
                return AuthRoutes.handleCreateUser(req);
            },
        },
        "/api/auth/users/:id": {
            async PUT(req: AuthenticatedRequest & { params: { id: string } }) {
                return AuthRoutes.handleUpdateUser(req, req.params.id);
            },
            async DELETE(req: AuthenticatedRequest & { params: { id: string } }) {
                return AuthRoutes.handleDeleteUser(req, req.params.id);
            },
        },
        "/api/processors": {
            async GET(req: AuthenticatedRequest) {
                const middleware = AuthMiddleware.requirePermission("processors", "read");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

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
            async GET(req: AuthenticatedRequest) {
                const middleware = AuthMiddleware.requirePermission("instances", "read");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

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
            async GET(req: AuthenticatedRequest) {
                const middleware = AuthMiddleware.requirePermission("schedules", "read");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const schedules = await scheduleService.getAllSchedules(req.db!);
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
            async POST(req: AuthenticatedRequest & { json: () => Schedule | PromiseLike<Schedule> }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "create");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const scheduleData = await req.json();
                    const schedule = await scheduleService.createSchedule(
                        scheduleData,
                        req.db!
                    );
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
            async GET(req: AuthenticatedRequest & { params: { id: string } }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "read");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const schedule = await scheduleService.getSchedule(req.params.id, req.db!);
						                    if (!schedule) {
                        return Response.json(
                            {
                                success: false,
                                error: "Schedule not found"
                            },
                            { status: 404 },
                        );
                    }

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
            async DELETE(req: AuthenticatedRequest & { params: { id: string } }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "delete");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const success = await scheduleService.deleteSchedule(req.params.id, req.db!);
                    
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
                                error: "Schedule not found"
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
            async PUT(req: AuthenticatedRequest & {
                params: { id: string };
                json: () => Partial<Schedule> | PromiseLike<Partial<Schedule>>;
            }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "update");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const updates = await req.json();
                    const schedule = await scheduleService.updateSchedule(
                        req.params.id,
                        updates,
                        req.db!
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
            async POST(req: AuthenticatedRequest & { params: { id: string } }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "start");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const schedule = await scheduleService.activateSchedule(
                        req.params.id,
                        req.db!
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
            async POST(req: AuthenticatedRequest & { params: { id: string } }) {
                const middleware = AuthMiddleware.requirePermission("schedules", "stop");
                const authResponse = await middleware(req);
                
                if (authResponse) {
                    return authResponse;
                }

                try {
                    const schedule = await scheduleService.deactivateSchedule(
                        req.params.id,
                        req.db!
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


// Graceful shutdown
process.on("SIGINT", async () => {
    await scheduler.shutdown();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await scheduler.shutdown();
    process.exit(0);
});
