import { useEffect, useRef, useState } from "react";
import { Schedule } from "./interfaces";
import { WebSocketMessage } from "./websocket-service";
import { scheduleDB } from "./dexie-db";

export interface WebSocketHook {
    isConnected: boolean;
    lastMessage: WebSocketMessage | null;
    sendMessage: (message: any) => void;
    connectionError: string | null;
}

export function useWebSocket(url: string): WebSocketHook {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;

    const connect = () => {
        try {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const host = window.location.host;
            
            // Handle different deployment environments
            let wsUrl: string;
            if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
                // Development mode - use current host which includes port
                wsUrl = `${protocol}//${host}${url}`;
            } else if (host.includes("alma.services.dhis2.hispuganda.org")) { // cSpell:disable-line
                // Production deployment for DHIS2 Uganda instance
                // You may need to adjust this based on your actual deployment setup
                wsUrl = `${protocol}//${host}${url}`;
            } else {
                // Default production mode
                wsUrl = `${protocol}//${host}${url}`;
            }
            
            
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                setIsConnected(true);
                setConnectionError(null);
                reconnectAttempts.current = 0;
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    setLastMessage(message);
                } catch (error) {
                    console.error("Error parsing WebSocket message:", error);
                }
            };

            wsRef.current.onclose = () => {
                setIsConnected(false);
                
                // Attempt to reconnect
                if (reconnectAttempts.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttempts.current++;
                        connect();
                    }, delay);
                } else {
                    setConnectionError("Failed to reconnect after multiple attempts");
                }
            };

            wsRef.current.onerror = (error) => {
                console.error("WebSocket error:", error);
                setConnectionError("WebSocket connection error");
            };

        } catch (error) {
            console.error("Error creating WebSocket:", error);
            setConnectionError("Failed to create WebSocket connection");
        }
    };

    const sendMessage = (message: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
        }
    };

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [url]);

    return {
        isConnected,
        lastMessage,
        sendMessage,
        connectionError,
    };
}

export function useScheduleWebSocket(
    onScheduleUpdate: (schedule: Schedule) => void,
    onScheduleCreated: (schedule: Schedule) => void,
    onScheduleDeleted: (id: string) => void,
    onScheduleStarted: (schedule: Schedule) => void,
    onScheduleStopped: (schedule: Schedule) => void,
    onProgressUpdate?: (id: string, progress: number, message?: string) => void,
) {
    const { isConnected, lastMessage, connectionError } = useWebSocket("/ws");

    useEffect(() => {
        if (!lastMessage) return;

        switch (lastMessage.type) {
            case "schedule_update":
                if ("id" in lastMessage.data) {
                    onScheduleUpdate(lastMessage.data as Schedule);
                }
                break;
            case "schedule_created":
                onScheduleCreated(lastMessage.data as Schedule);
                break;
            case "schedule_deleted":
                if ("id" in lastMessage.data) {
                    onScheduleDeleted((lastMessage.data as { id: string }).id);
                }
                break;
            case "schedule_started":
                onScheduleStarted(lastMessage.data as Schedule);
                break;
            case "schedule_stopped":
                onScheduleStopped(lastMessage.data as Schedule);
                break;
            case "progress_update":
                if (onProgressUpdate && "id" in lastMessage.data && "progress" in lastMessage.data) {
                    const progressData = lastMessage.data as { id: string; progress: number; message?: string };
                    onProgressUpdate(progressData.id, progressData.progress, progressData.message);
                }
                break;
        }
    }, [lastMessage, onScheduleUpdate, onScheduleCreated, onScheduleDeleted, onScheduleStarted, onScheduleStopped, onProgressUpdate]);

    return {
        isConnected,
        connectionError,
    };
}