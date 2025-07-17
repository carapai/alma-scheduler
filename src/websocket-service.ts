import { ServerWebSocket } from "bun";
import { Schedule } from "./interfaces";

export interface WebSocketMessage {
    type:
        | "schedule_update"
        | "schedule_created"
        | "schedule_deleted"
        | "schedule_started"
        | "schedule_stopped"
        | "progress_update";
    data: Schedule | { id: string } | { schedules: Schedule[] } | { id: string; progress: number; message?: string };
    timestamp: Date;
}

export class WebSocketService {
    private connections: Set<ServerWebSocket<any>> = new Set();
    private static instance: WebSocketService;

    private constructor() {}

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    addConnection(ws: ServerWebSocket<any>) {
        this.connections.add(ws);
    }

    removeConnection(ws: ServerWebSocket<any>) {
        this.connections.delete(ws);
    }

    broadcast(message: WebSocketMessage) {
        const messageStr = JSON.stringify(message);
        let sentCount = 0;

        this.connections.forEach((ws) => {
            try {
                if (ws.readyState === 1) {
                    ws.send(messageStr);
                    sentCount++;
                }
            } catch (error) {
                console.error("Error sending WebSocket message:", error);
                this.connections.delete(ws);
            }
        });

        if (sentCount > 0) {
        }
    }

    // Convenience methods for different message types
    broadcastScheduleUpdate(schedule: Schedule) {
        this.broadcast({
            type: "schedule_update",
            data: schedule,
            timestamp: new Date(),
        });
    }

    broadcastScheduleCreated(schedule: Schedule) {
        this.broadcast({
            type: "schedule_created",
            data: schedule,
            timestamp: new Date(),
        });
    }

    broadcastScheduleDeleted(id: string) {
        this.broadcast({
            type: "schedule_deleted",
            data: { id },
            timestamp: new Date(),
        });
    }

    broadcastScheduleStarted(schedule: Schedule) {
        this.broadcast({
            type: "schedule_started",
            data: schedule,
            timestamp: new Date(),
        });
    }

    broadcastScheduleStopped(schedule: Schedule) {
        this.broadcast({
            type: "schedule_stopped",
            data: schedule,
            timestamp: new Date(),
        });
    }

    broadcastScheduleList(schedules: Schedule[]) {
        this.broadcast({
            type: "schedule_update",
            data: { schedules },
            timestamp: new Date(),
        });
    }

    broadcastProgress(id: string, progress: number, message?: string) {
        this.broadcast({
            type: "progress_update",
            data: { id, progress, message },
            timestamp: new Date(),
        });
    }

    getConnectionCount(): number {
        return this.connections.size;
    }
}

export const webSocketService = WebSocketService.getInstance();
