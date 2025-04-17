import { serve } from "bun";
import index from "./index.html";
import { db, initializeDatabase } from "@/db";
import { Schedule } from "@/interfaces";
import {
    restoreActiveSchedules,
    scheduleFromRow,
    startScheduleJob,
} from "@/schedule";

import * as cron from "node-cron";
import { queryDHIS2 } from "./utils";

const runningJobs: Map<string, cron.ScheduledTask> = new Map();

function initializeSystem(func: (schedule: Schedule) => Promise<void>) {
    console.log("Initializing schedule system...");
    initializeDatabase();
    restoreActiveSchedules(func);
    console.log("Schedule system initialized");
}

initializeSystem(async (schedule) => {
    await queryDHIS2(schedule);
});

const server = serve({
    routes: {
        "/*": index,
        "/api/schedules": {
            async POST(req) {
                const body = await req.json();
                const {
                    name,
                    cronExpression,
                    task,
                    maxRetries = 3,
                    retryDelay = 60,
                    pe,
                    ou,
                    scorecard,
                    includeChildren,
                } = body;

                if (!name || !cronExpression || !task) {
                    return Response.json(
                        { error: "Missing required fields" },
                        { status: 400 },
                    );
                }
                if (maxRetries < 0 || maxRetries > 10) {
                    return Response.json(
                        {
                            error: "maxRetries must be between 0 and 10",
                        },
                        { status: 400 },
                    );
                }

                if (retryDelay < 0 || retryDelay > 3600) {
                    return Response.json(
                        {
                            error: "retryDelay must be between 0 and 3600 seconds",
                        },
                        { status: 400 },
                    );
                }

                const id = crypto.randomUUID();
                const now = new Date().toISOString();

                db.run(
                    `INSERT INTO schedules (id, name, cronExpression, task, createdAt, updatedAt, isActive, progress, status, maxRetries, retryDelay,pe,ou,scorecard,includeChildren) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'idle', ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        name,
                        cronExpression,
                        task,
                        now,
                        now,
                        maxRetries,
                        retryDelay,
                        pe,
                        ou,
                        scorecard,
                        includeChildren,
                    ],
                );

                const schedule = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);

                if (!schedule) {
                    return Response.json(
                        { error: "Schedule not found" },
                        { status: 404 },
                    );
                }

                return Response.json(
                    {
                        message: "Schedule created successfully",
                        schedule: scheduleFromRow(schedule),
                    },
                    { status: 201 },
                );
            },
            async GET() {
                const schedules = db
                    .query<Schedule, null>("SELECT * FROM schedules")
                    .all(null);
                console.log(schedules);
                return Response.json({
                    schedules: schedules.map(scheduleFromRow),
                });
            },
        },
        "/api/schedules/:id": {
            async GET(req) {
                const id = req.params.id;
                const schedule = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);

                if (!schedule) {
                    return Response.json(
                        {
                            error: "Schedule not found",
                        },
                        { status: 404 },
                    );
                }
                return Response.json(
                    { schedule: scheduleFromRow(schedule) },
                    { status: 200 },
                );
            },
            async DELETE(req) {
                const id = req.params.id;
                const schedule = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);

                if (!schedule) {
                    return Response.json(
                        { error: "Schedule not found" },
                        { status: 404 },
                    );
                }
                try {
                    if (schedule.isActive) {
                        const job = runningJobs.get(id);
                        if (job) {
                            job.stop();
                            runningJobs.delete(id);
                        }
                    }

                    db.run("DELETE FROM schedules WHERE id = ?", [id]);
                    return Response.json({
                        message: "Schedule deleted successfully",
                    });
                } catch (error) {
                    return Response.json(
                        { error: "Failed to delete schedule" },
                        { status: 500 },
                    );
                }
            },
            async PUT(req) {
                const id = req.params.id;
                const currentSchedule: Partial<Schedule> = await req.json();
                const schedule = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);

                if (!schedule) {
                    return Response.json(
                        { error: "Schedule not found" },
                        { status: 404 },
                    );
                }
                const merged = { ...schedule, ...currentSchedule };

                const now = new Date().toISOString();

                db.run(
                    `UPDATE schedules set name = ?, cronExpression = ?, task = ?, updatedAt = ?, maxRetries = ?, retryDelay = ?, pe = ?, ou = ?, scorecard = ?, includeChildren = ? WHERE id = ?`,
                    [
                        merged.name,
                        merged.cronExpression,
                        merged.task,
                        now,
                        merged.maxRetries,
                        merged.retryDelay,
                        merged.pe,
                        merged.ou,
                        merged.scorecard,
                        merged.includeChildren,
                        id,
                    ],
                );

                return Response.json(
                    {
                        schedule: scheduleFromRow(merged),
                    },
                    { status: 200 },
                );
            },
        },
        "/api/schedules/:id/start": {
            async POST(req) {
                const id = req.params.id;
                const scheduleRow = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);
                if (!scheduleRow) {
                    return Response.json(
                        { error: "Schedule not found" },
                        { status: 404 },
                    );
                }
                const schedule = scheduleFromRow(scheduleRow);

                if (schedule.isActive) {
                    return Response.json(
                        { error: "Schedule is already running" },
                        { status: 400 },
                    );
                }

                try {
                    startScheduleJob(schedule, queryDHIS2);
                    db.run(
                        `UPDATE schedules SET isActive = 1, updatedAt = ?, status = 'running', progress = 0 WHERE id = ?`,
                        [new Date().toISOString(), id],
                    );

                    const updatedSchedule = db
                        .query<Schedule, string>(
                            "SELECT * FROM schedules WHERE id = ?",
                        )
                        .get(id);

                    if (!updatedSchedule) {
                        return Response.json(
                            { error: "Schedule not found" },
                            { status: 404 },
                        );
                    }
                    return Response.json({
                        message: "Schedule started successfully",
                        schedule: scheduleFromRow(updatedSchedule),
                    });
                } catch (error: any) {
                    return Response.json(
                        { error: "Failed to start schedule" },
                        { status: 500, statusText: error.message },
                    );
                }
            },
        },
        "/api/schedules/:id/stop": {
            async POST(req) {
                const id = req.params.id;
                const scheduleRow = db
                    .query<Schedule, string>(
                        "SELECT * FROM schedules WHERE id = ?",
                    )
                    .get(id);

                if (!scheduleRow) {
                    return Response.json(
                        { error: "Schedule not found" },
                        { status: 404 },
                    );
                }

                const schedule = scheduleFromRow(scheduleRow);

                if (!schedule.isActive) {
                    return Response.json(
                        { error: "Schedule is not running" },
                        { status: 400 },
                    );
                }

                try {
                    const job = runningJobs.get(id);
                    if (job) {
                        job.stop();
                        runningJobs.delete(id);
                    }

                    db.run(
                        `UPDATE schedules SET isActive = 0, updatedAt = ?, status = 'idle' WHERE id = ?`,
                        [new Date().toISOString(), id],
                    );

                    const updatedSchedule = db
                        .query<Schedule, string>(
                            "SELECT * FROM schedules WHERE id = ?",
                        )
                        .get(id);

                    if (!updatedSchedule) {
                        return Response.json(
                            { error: "Schedule not found" },
                            { status: 404 },
                        );
                    }
                    return Response.json({
                        message: "Schedule stopped successfully",
                        schedule: scheduleFromRow(updatedSchedule),
                    });
                } catch (error: any) {
                    return Response.json(
                        { error: "Failed to stop schedule" },
                        { status: 500, statusText: error.message },
                    );
                }
            },
        },
    },
    development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);
