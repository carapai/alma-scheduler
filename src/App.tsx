import "@/index.css";
import { Schedule } from "@/interfaces";
import type { TableColumnsType } from "antd";
import {
    Badge,
    Button,
    DatePicker,
    Flex,
    Form,
    Input,
    InputNumber,
    Modal,
    Progress,
    Select,
    Switch,
    Table,
    Tag,
		Typography,
} from "antd";
import dayjs from "dayjs";
import cronParser from "cron-parser";
import { Play, Settings, Square, Trash2, Wifi, WifiOff } from "lucide-react";
import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useWebSocketDexie } from "./useWebSocketDexie";
import { useLiveQuery } from "dexie-react-hooks";
import { scheduleDB } from "./dexie-db";

const getStatusColor = (status?: string) => {
    switch (status) {
        case "running":
            return "processing";
        case "completed":
            return "success";
        case "failed":
            return "error";
        case "paused":
            return "warning";
        default:
            return "default";
    }
};

const defaultSchedule: Omit<Schedule, "id" | "createdAt" | "updatedAt"> = {
    name: "",
    type: "one-time",
    cronExpression: "",
    isActive: false,
    runImmediately: false,
    lastRun: undefined,
    nextRun: undefined,
    progress: 0,
    status: "idle",
    retryAttempts: 0,
    maxRetries: 3,
    retryDelay: 60,
    scorecard: 0,
    message: "",
    indicatorGroup: "",
    periodType: "monthly",
    dhis2Instance: "",
    almaInstance: "",
    processor: "dhis2-alma-sync",
    data: {
        runFor: "current",
        periods: [],
        periodType: "monthly",
        dhis2Instance: "",
        almaInstance: "",
        scorecard: 0,
        indicatorGroup: "",
    },
};

export function App() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [current, setCurrent] = useState<Schedule>(
        defaultSchedule as Schedule,
    );
    const [form] = Form.useForm<Schedule>();

    const scheduleType = Form.useWatch("type", form);
    const periodType = Form.useWatch(["data", "periodType"], form);
    const dexieSchedules = useLiveQuery(() => scheduleDB.getAllSchedules(), []);
    const { isConnected, lastMessage, connectionError } =
        useWebSocketDexie("/ws");
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const response = await fetch("/api/schedules");
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.schedules) {
                        await scheduleDB.syncSchedules(data.schedules);
                    }
                }
            } catch (error) {
                console.error("Failed to load initial schedules:", error);
            }
        };

        loadInitialData();
    }, []);

    // Load processors and instances separately (these don't need real-time updates)
    const [processors, setProcessors] = useState<string[]>([]);
    const [instances, setInstances] = useState<{
        dhis2Instances: string[];
        almaInstances: string[];
    }>({ dhis2Instances: [], almaInstances: [] });

    useEffect(() => {
        const loadStaticData = async () => {
            try {
                const [processorsRes, instancesRes] = await Promise.all([
                    fetch("/api/processors"),
                    fetch("/api/instances"),
                ]);

                if (processorsRes.ok) {
                    const processorsData = await processorsRes.json();
                    if (processorsData.success) {
                        setProcessors(processorsData.processors);
                    }
                }

                if (instancesRes.ok) {
                    const instancesData = await instancesRes.json();
                    if (instancesData.success) {
                        setInstances({
                            dhis2Instances: instancesData.dhis2Instances,
                            almaInstances: instancesData.almaInstances,
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to load static data:", error);
            }
        };

        loadStaticData();
    }, []);

    // Handle WebSocket messages and update Dexie
    useEffect(() => {
        if (lastMessage) {
            console.log("WebSocket message received:", lastMessage);

            const handleWebSocketMessage = async () => {
                try {
                    switch (lastMessage.type) {
                        case "progress_update":
                            if (
                                "id" in lastMessage.data &&
                                "progress" in lastMessage.data
                            ) {
                                const { id, progress, message } =
                                    lastMessage.data as {
                                        id: string;
                                        progress: number;
                                        message?: string;
                                    };
                                console.log(
                                    `Updating Dexie progress for ${id}: ${progress}%`,
                                );
                                await scheduleDB.updateScheduleProgress(
                                    id,
                                    progress,
                                    message,
                                );
                            }
                            break;

                        case "schedule_update":
                            if ("id" in lastMessage.data) {
                                const schedule = lastMessage.data as Schedule;
                                console.log(
                                    `Updating Dexie schedule:`,
                                    schedule,
                                );
                                await scheduleDB.upsertSchedule(schedule);
                            }
                            break;

                        case "schedule_created":
                            const newSchedule = lastMessage.data as Schedule;
                            console.log(
                                `Adding new schedule to Dexie:`,
                                newSchedule,
                            );
                            await scheduleDB.upsertSchedule(newSchedule);
                            break;

                        case "schedule_deleted":
                            if ("id" in lastMessage.data) {
                                const { id } = lastMessage.data as {
                                    id: string;
                                };
                                console.log(
                                    `Deleting schedule from Dexie: ${id}`,
                                );
                                await scheduleDB.deleteSchedule(id);
                            }
                            break;

                        case "schedule_started":
                        case "schedule_stopped":
                            const updatedSchedule =
                                lastMessage.data as Schedule;
                            console.log(
                                `Updating schedule status in Dexie:`,
                                updatedSchedule,
                            );
                            await scheduleDB.upsertSchedule(updatedSchedule);
                            break;

                        default:
                            console.log(
                                `Unhandled message type: ${lastMessage.type}`,
                            );
                    }
                } catch (error) {
                    console.error("Error handling WebSocket message:", error);
                }
            };

            handleWebSocketMessage();
        }
    }, [lastMessage]);

    React.useEffect(() => {
        if (scheduleType !== "recurring") {
            form.setFieldValue("runImmediately", false);
            form.setFieldsValue({
                data: { ...form.getFieldValue("data"), runFor: "current" },
            });
        } else {
            form.setFieldsValue({
                data: { ...form.getFieldValue("data"), periodType: "monthly" },
            });
        }
    }, [scheduleType, form]);

    const handleStart = async (schedule: Schedule) => {
        console.log("Starting schedule:", schedule);
        try {
            const response = await fetch(
                `/api/schedules/${schedule.id}/start`,
                {
                    method: "POST",
                },
            );
            if (response.ok) {
                const data = await response.json();
                await scheduleDB.upsertSchedule(data.schedule);
            }
        } catch (error) {
            console.error("Failed to start schedule:", error);
        }
    };

    const handleStop = async (schedule: Schedule) => {
        try {
            const response = await fetch(`/api/schedules/${schedule.id}/stop`, {
                method: "POST",
            });
            if (response.ok) {
                const data = await response.json();
                // Update Dexie directly
                await scheduleDB.upsertSchedule(data.schedule);
            }
        } catch (error) {
            console.error("Failed to stop schedule:", error);
        }
    };

    const handleDelete = async (schedule: Schedule) => {
        if (window.confirm("Are you sure you want to delete this schedule?")) {
            try {
                const response = await fetch(`/api/schedules/${schedule.id}`, {
                    method: "DELETE",
                });
                if (response.ok) {
                    // Update Dexie directly
                    await scheduleDB.deleteSchedule(schedule.id);
                }
            } catch (error) {
                console.error("Failed to delete schedule:", error);
            }
        }
    };

    const startEdit = (schedule: Schedule) => {
        const currentSchedule = {
            ...schedule,
            data: {
                ...schedule.data,
                periods: (schedule.data.periods || []).map((p: string) =>
                    dayjs(p),
                ),
            },
        };
        setIsEditing(true);
        setCurrent(currentSchedule);
        form.setFieldsValue(currentSchedule);
        setIsModalOpen(true);
    };

    const columns: TableColumnsType<Schedule> = [
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
        },
        {
            title: "Type",
            dataIndex: "type",
            key: "type",
            render: (type) => (
                <Tag
                    color={
                        type === "recurring"
                            ? "blue"
                            : type === "immediate"
                            ? "red"
                            : "green"
                    }
                >
                    {type}
                </Tag>
            ),
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            render: (status) => (
                <Badge status={getStatusColor(status)} text={status} />
            ),
        },
        {
            title: "DHIS2 Instance",
            dataIndex: ["data", "dhis2Instance"],
            key: "dhis2Instance",
            render: (instance) => instance || "N/A",
        },
        {
            title: "Period Type",
            dataIndex: ["data", "periodType"],
            key: "periodType",
            render: (periodType) => (
                <Tag color="purple">{periodType || "N/A"}</Tag>
            ),
        },
        {
            title: "Progress",
            dataIndex: "progress",
            key: "progress",
            render: (progress) => (
                <Progress
                    percent={Number(progress)}
                    size="small"
										type="line"
                    format={(percent) => `${percent?.toFixed(1)}%`}
                />
            ),
        },
        {
            title: "Last Run",
            dataIndex: "lastRun",
            key: "lastRun",
            render: (lastRun) =>
                lastRun
                    ? dayjs(lastRun).format("YYYY-MM-DD HH:mm:ss")
                    : "Never",
        },
        {
            title: "Next Run",
            key: "nextRun",
            render: (_, schedule) => {
                try {
                    if (schedule.type === "recurring" && schedule.cronExpression && schedule.isActive) {
                        const interval = cronParser.parseExpression(schedule.cronExpression);
                        const nextRun = interval.next().toDate();
                        return dayjs(nextRun).format("YYYY-MM-DD HH:mm:ss");
                    } else if (schedule.nextRun) {
                        return dayjs(schedule.nextRun).format("YYYY-MM-DD HH:mm:ss");
                    } else if (schedule.type === "one-time" && schedule.data?.periods?.length > 0) {
                        return "Manual start";
                    } else {
                        return "Not scheduled";
                    }
                } catch (error) {
                    return "Invalid cron";
                }
            },
        },
        {
            title: "Schedule",
            key: "schedule",
            render: (_, schedule) => {
                if (schedule.type === "recurring" && schedule.cronExpression) {
                    return <Tag color="blue">{schedule.cronExpression}</Tag>;
                } else if (
                    schedule.data?.periods &&
                    schedule.data.periods.length > 0
                ) {
                    return (
                        <Tag color="green">
                            {schedule.data.periods.length} periods
                        </Tag>
                    );
                } else {
                    return <Tag color="orange">Auto-calculated</Tag>;
                }
            },
        },
        {
            title: "Actions",
            key: "actions",
            render: (_, schedule) => (
                <Flex gap="8px">
                    {schedule.status === "running" ? (
                        <Button
                            type="text"
                            icon={<Square className="w-4 h-4" />}
                            onClick={() => handleStop(schedule)}
                            title="Stop"
                        />
                    ) : (
                        <Button
                            type="text"
                            icon={<Play className="w-4 h-4" />}
                            onClick={() => handleStart(schedule)}
                            title="Start"
                        />
                    )}
                    <Button
                        type="text"
                        icon={<Settings className="w-4 h-4" />}
                        onClick={() => startEdit(schedule)}
                        title="Edit"
                    />
                    <Button
                        type="text"
                        danger
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={() => handleDelete(schedule)}
                        title="Delete"
                    />
                </Flex>
            ),
        },
    ];

    const schedules = (dexieSchedules || []).map((schedule) => ({
        ...schedule,
        progress:
            schedule.localProgress !== undefined
                ? schedule.localProgress
                : schedule.progress,
        message: schedule.localMessage || schedule.message,
        status: schedule.localStatus || schedule.status,
    })) as Schedule[];

    const handleCancel = () => {
        setIsModalOpen(false);
        setIsEditing(false);
        setCurrent(defaultSchedule as Schedule);
        form.resetFields();
    };

    const onCreate = async (values: Schedule) => {
        try {
            const url = isEditing
                ? `/api/schedules/${current.id}`
                : "/api/schedules";
            const method = isEditing ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(values),
            });

            if (response.ok) {
                const data = await response.json();
                // Update Dexie directly
                await scheduleDB.upsertSchedule(data.schedule);
                setIsModalOpen(false);
                setIsEditing(false);
                setCurrent(defaultSchedule as Schedule);
                form.resetFields();
            }
        } catch (error) {
            console.error("Failed to save schedule:", error);
        }
    };

    if (!dexieSchedules) return <div>Loading...</div>;

    return (
        <Flex
            className="h-screen w-screen"
            vertical
            gap="16px"
            style={{ padding: "16px", backgroundColor: "#f5f5f5" }}
        >
            <Flex justify="space-between" align="center">
                <Flex align="center" gap="16px">
                    <Typography.Title level={3}>Schedule Management</Typography.Title>
                    <Badge
                        status={isConnected ? "success" : "error"}
                        text={
                            <Flex align="center" gap="4px">
                                {isConnected ? (
                                    <Wifi className="w-4 h-4" />
                                ) : (
                                    <WifiOff className="w-4 h-4" />
                                )}
                                <span>
                                    {isConnected
                                        ? "Connected"
                                        : connectionError || "Disconnected"}
                                </span>
                            </Flex>
                        }
                    />
                </Flex>
                <Button
                    type="primary"
                    onClick={() => {
                        setCurrent({
                            ...defaultSchedule,
                            id: uuidv4(),
                        } as Schedule);
                        setIsEditing(false);
                        form.resetFields();
                        setIsModalOpen(true);
                    }}
                >
                    Create Schedule
                </Button>
            </Flex>

            <Table
                columns={columns}
                dataSource={schedules}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                expandable={{
                    expandedRowRender: (record) => (
                        <pre style={{ fontSize: "12px", margin: 0 }}>
                            {JSON.stringify(record, null, 2)}
                        </pre>
                    ),
                }}
            />

            <Modal
                title={isEditing ? "Edit Schedule" : "Create Schedule"}
                open={isModalOpen}
                onCancel={handleCancel}
                footer={[
                    <Button key="cancel" onClick={handleCancel}>
                        Cancel
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        onClick={() => form.submit()}
                    >
                        {isEditing ? "Update" : "Create"}
                    </Button>,
                ]}
                width="80%"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onCreate}
                    initialValues={current}
                >
                    <Flex gap="24px">
                        <Flex vertical flex={1}>
                            <Form.Item name="id" label="Schedule ID">
                                <Input disabled />
                            </Form.Item>
                            <Form.Item
                                name="name"
                                label="Schedule Name"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                            <Form.Item
                                name="type"
                                label="Schedule Type"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        {
                                            label: "One-time",
                                            value: "one-time",
                                        },
                                        {
                                            label: "Recurring",
                                            value: "recurring",
                                        },
                                        {
                                            label: "Immediate",
                                            value: "immediate",
                                        },
                                    ]}
                                />
                            </Form.Item>
                            {scheduleType === "recurring" && (
                                <Form.Item
                                    name="runImmediately"
                                    label="Run Immediately"
                                    valuePropName="checked"
                                    tooltip="Run once immediately when schedule is created, then continue on cron schedule"
                                >
                                    <Switch />
                                </Form.Item>
                            )}
                            {scheduleType === "recurring" && (
                                <Form.Item
                                    name="cronExpression"
                                    label="Cron Expression"
                                    rules={[{ required: true }]}
                                >
                                    <Input placeholder="0 0 * * *" />
                                </Form.Item>
                            )}
                            <Form.Item
                                name="processor"
                                label="Processor"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={processors.map((p) => ({
                                        label: p,
                                        value: p,
                                    }))}
                                />
                            </Form.Item>
                        </Flex>
                        <Flex vertical flex={1}>
                            <Form.Item
                                name={["data", "dhis2Instance"]}
                                label="DHIS2 Instance"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={instances.dhis2Instances.map(
                                        (i) => ({
                                            label: i,
                                            value: i,
                                        }),
                                    )}
                                />
                            </Form.Item>
                            <Form.Item
                                name={["data", "almaInstance"]}
                                label="ALMA Instance"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={instances.almaInstances.map(
                                        (i) => ({
                                            label: i,
                                            value: i,
                                        }),
                                    )}
                                />
                            </Form.Item>
                            <Form.Item
                                name={["data", "scorecard"]}
                                label="Scorecard"
                                rules={[{ required: true }]}
                            >
                                <InputNumber style={{ width: "100%" }} />
                            </Form.Item>
                            <Form.Item
                                name={["data", "indicatorGroup"]}
                                label="Indicator Group"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                            {scheduleType !== "recurring" && (
                                <Form.Item
                                    name={["data", "periodType"]}
                                    label="Period Type"
                                    rules={[{ required: true }]}
                                    tooltip="For non-recurring schedules: choose the type of periods to select"
                                >
                                    <Select
                                        options={[
                                            { label: "Daily", value: "day" },
                                            { label: "Weekly", value: "week" },
                                            {
                                                label: "Monthly",
                                                value: "monthly",
                                            },
                                            {
                                                label: "Quarterly",
                                                value: "quarterly",
                                            },
                                            { label: "Yearly", value: "year" },
                                        ]}
                                    />
                                </Form.Item>
                            )}
                            {scheduleType !== "recurring" && periodType && (
                                <Form.Item
                                    name={["data", "periods"]}
                                    label={`Select ${
                                        periodType === "day"
                                            ? "Dates"
                                            : periodType === "week"
                                            ? "Weeks"
                                            : periodType === "monthly"
                                            ? "Months"
                                            : periodType === "quarterly"
                                            ? "Quarters"
                                            : "Years"
                                    }`}
                                    rules={[
                                        {
                                            required: true,
                                            message:
                                                "Please select at least one period",
                                        },
                                    ]}
                                >
                                    <DatePicker
                                        multiple
                                        picker={
                                            periodType === "day"
                                                ? "date"
                                                : periodType === "week"
                                                ? "week"
                                                : periodType === "monthly"
                                                ? "month"
                                                : periodType === "quarterly"
                                                ? "quarter"
                                                : "year"
                                        }
                                        style={{ width: "100%" }}
                                        placeholder={`Select ${
                                            periodType === "day"
                                                ? "Dates"
                                                : periodType === "week"
                                                ? "Weeks"
                                                : periodType === "monthly"
                                                ? "Months"
                                                : periodType === "quarterly"
                                                ? "Quarters"
                                                : "Years"
                                        }`}
                                    />
                                </Form.Item>
                            )}
                            {scheduleType === "recurring" && (
                                <Form.Item
                                    name={["data", "runFor"]}
                                    label="Run For"
                                    rules={[{ required: true }]}
                                    tooltip="For recurring schedules: choose whether to process current or previous period on each run"
                                >
                                    <Select
                                        options={[
                                            {
                                                label: "Current Period",
                                                value: "current",
                                            },
                                            {
                                                label: "Previous Period",
                                                value: "previous",
                                            },
                                        ]}
                                    />
                                </Form.Item>
                            )}
                            <Form.Item name="maxRetries" label="Max Retries">
                                <InputNumber
                                    style={{ width: "100%" }}
                                    min={0}
                                />
                            </Form.Item>
                        </Flex>
                    </Flex>
                </Form>
            </Modal>
        </Flex>
    );
}

export default App;
