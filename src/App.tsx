import { Schedule } from "@/interfaces";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TableColumnsType } from "antd";
import {
    Button,
    Flex,
    Form,
    Input,
    InputNumber,
    Modal,
    Progress,
    Table,
    Select,
} from "antd";
import {
    Play,
    Square,
    Trash2,
    AlertCircle,
    CheckCircle,
    Clock,
} from "lucide-react";
import { useState } from "react";
import "./index.css";

const formItemLayout = {
    labelCol: {
        xs: { span: 24 },
        sm: { span: 8 },
    },
    wrapperCol: {
        xs: { span: 24 },
        sm: { span: 16 },
    },
};

const getStatusIcon = (status?: string) => {
    switch (status) {
        case "running":
            return <Clock className="w-5 h-5 text-blue-500" />;
        case "completed":
            return <CheckCircle className="w-5 h-5 text-green-500" />;
        case "failed":
            return <AlertCircle className="w-5 h-5 text-red-500" />;
        default:
            return <Clock className="w-5 h-5 text-gray-500" />;
    }
};

const getStatusColor = (status?: string) => {
    switch (status) {
        case "running":
            return "bg-blue-500";
        case "completed":
            return "bg-green-500";
        case "failed":
            return "bg-red-500";
        default:
            return "bg-gray-500";
    }
};

const defaultSchedules: Partial<Schedule> = {
    name: "",
    cronExpression: "",
    maxRetries: 3,
    retryDelay: 60,
};

export function App() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [current, setCurrent] = useState<Partial<Schedule>>(defaultSchedules);

    const handleStart = async (schedule: Partial<Schedule>) => {
        try {
            setIsEditing(true);
            setCurrent(schedule);
            const request = new Request(`/api/schedules/${schedule.id}/start`, {
                method: "POST",
            });
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error("Something went wrong on API server!");
                    }
                })
                .then((response) => updateUI(response.schedule, true))
                .catch((error) => {
                    console.error(error);
                });
        } catch (err) {}
    };

    const handleStop = async (schedule: Partial<Schedule>) => {
        try {
            setIsEditing(() => true);
            setCurrent(schedule);
            const request = new Request(`/api/schedules/${schedule.id}/stop`, {
                method: "POST",
            });
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error("Something went wrong on API server!");
                    }
                })
                .then((response) => updateUI(response.schedule, true))
                .catch((error) => {
                    console.error(error);
                });
        } catch (err) {}
    };

    const handleDelete = async (schedule: Partial<Schedule>) => {
        setIsEditing(() => true);
        setCurrent(schedule);
        if (window.confirm("Are you sure you want to delete this schedule?")) {
            try {
                const request = new Request(`/api/schedules/${schedule.id}`, {
                    method: "DELETE",
                });

                fetch(request)
                    .then((response) => {
                        if (response.ok) {
                            return response.json();
                        } else {
                            throw new Error(
                                "Something went wrong on API server!",
                            );
                        }
                    })
                    .then((response) => updateUI(response.schedule, true, true))
                    .catch((error) => {
                        console.error(error);
                    });
            } catch (err) {}
        }
    };

    const startEdit = (schedule: Partial<Schedule>) => {
        setIsEditing(() => true);
        setCurrent(schedule);
        setIsModalOpen(() => true);
    };

    const columns: TableColumnsType<Partial<Schedule>> = [
        { title: "Name", dataIndex: "name" },
        { title: "Cron Expression", dataIndex: "cronExpression" },
        {
            title: "Status",
            dataIndex: "status",
            render: (_, row) => {
                return (
                    <>
                        {getStatusIcon(row.status)}
                        <span>{row.status || "idle"}</span>
                    </>
                );
            },
        },
        {
            title: "Progress",
            dataIndex: "progress",
            render: (_, row) => {
                return (
                    <Progress
                        percent={row.progress}
                        format={(val) => `${val?.toFixed(0)}%`}
                        strokeColor="green"
                    />
                );
            },
        },
        {
            title: "Last Run",
            dataIndex: "lastRun",
        },

        {
            title: "Next Run",
            dataIndex: "nextRun",
        },

        {
            title: "Action",
            key: "action",
            width: "200px",
            render: (_, row) => {
                return (
                    <Flex gap="10px">
                        {!row.isActive ? (
                            <button
                                onClick={() => handleStart(row)}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                                title="Start"
                            >
                                <Play className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleStop(row)}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                                title="Stop"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={() => startEdit(row)}
                            className="p-1 hover:bg-gray-100 rounded text-blue-500 cursor-pointer"
                            title="Edit"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => handleDelete(row)}
                            className="p-1 hover:bg-gray-100 rounded text-red-500 cursor-pointer"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </Flex>
                );
            },
        },
    ];

    const { isPending, error, data } = useQuery<{
        schedules: Partial<Schedule>[];
    }>({
        queryKey: ["repoData"],
        queryFn: () => fetch("/api/schedules").then((res) => res.json()),
        refetchInterval: 1000,
    });

    const handleCancel = () => {
        setIsModalOpen(false);
    };

    const [form] = Form.useForm<Partial<Schedule>>();

    const updateUI = (
        schedule: Partial<Schedule>,
        editing: boolean,
        remove = false,
    ) => {
        queryClient.setQueryData<{ schedules: Partial<Schedule>[] }>(
            ["repoData"],
            (prev) => {
                if (prev && editing === true) {
                    return {
                        schedules: prev.schedules.flatMap((s) => {
                            if (s.id === schedule.id) {
                                if (remove) {
                                    return [];
                                }
                                return {
                                    ...s,
                                    ...schedule,
                                };
                            }
                            return s;
                        }),
                    };
                } else if (editing === false) {
                    if (prev) {
                        return {
                            schedules: prev.schedules.concat(schedule),
                        };
                    } else {
                        return { schedules: [schedule] };
                    }
                }

                return prev;
            },
        );
    };

    const onCreate = (values: Partial<Schedule>) => {
        let request = new Request("/api/schedules", {
            method: "POST",
            body: JSON.stringify(values),
        });
        if (isEditing) {
            request = new Request(`/api/schedules/${current.id}`, {
                method: "PUT",
                body: JSON.stringify(values),
            });
        }
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error("Something went wrong on API server!");
                }
            })
            .then((response) => updateUI(response.schedule, isEditing))
            .catch((error) => {
                console.error(error);
            });
        setIsModalOpen(() => false);
        setCurrent(() => defaultSchedules);
    };

    if (isPending) return "Loading...";

    if (error) return "An error has occurred: " + error.message;
    return (
        <Flex
            className="h-screen w-screen"
            vertical
            gap="10px"
            style={{ padding: "10px", backgroundColor: "whitesmoke" }}
        >
            <Flex justify="flex-end">
                <Button
                    type="primary"
                    onClick={() => {
                        setIsEditing(false);
                        setIsModalOpen(true);
                    }}
                >
                    Add Schedule
                </Button>
            </Flex>
            <Modal
                title="Schedule"
                open={isModalOpen}
                okButtonProps={{ autoFocus: true, htmlType: "submit" }}
                onCancel={handleCancel}
                destroyOnClose
                modalRender={(dom) => (
                    <Form
                        {...formItemLayout}
                        form={form}
                        name="form_in_modal"
                        clearOnDestroy
                        onFinish={(values) => onCreate(values)}
                        initialValues={current}
                    >
                        {dom}
                    </Form>
                )}
            >
                <Form.Item name="name" label="Name">
                    <Input />
                </Form.Item>

                <Form.Item name="scorecard" label="Scorecard">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>

                <Form.Item name="cronExpression" label="Cron Expression">
                    <Input />
                </Form.Item>

                <Form.Item name="indicatorGroup" label="Indicator Group">
                    <Input />
                </Form.Item>
                <Form.Item name="periodType" label="Period Type">
                    <Select>
                        <Select.Option value="quarterly">
                            Quarterly
                        </Select.Option>
                        <Select.Option value="monthly">Monthly</Select.Option>
                    </Select>
                </Form.Item>
                {/* <Form.Item name="task" label="Task">
                    <Input />
                </Form.Item>

                <Form.Item name="maxRetries" label="Max Retries">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item>

                <Form.Item name="retryDelay" label="Retry Delay">
                    <InputNumber style={{ width: "100%" }} />
                </Form.Item> */}
            </Modal>
            <Table
                columns={columns}
                dataSource={data.schedules}
                rowKey="id"
                expandable={{
                    expandedRowRender: (record) => (
                        <pre>{JSON.stringify(record, null, 2)}</pre>
                    ),
                }}
            />
        </Flex>
    );
}

export default App;
