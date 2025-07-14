import "@/index.css";
import { JobRequest } from "@/utils";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { TableColumnsType } from "antd";
import {
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
    Radio,
} from "antd";
import type { CheckboxGroupProps } from "antd/es/checkbox";
import {
    AlertCircle,
    CheckCircle,
    Clock,
    Play,
    Square,
    Trash2,
} from "lucide-react";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

import {
    dayOptions,
    hourOptions,
    minuteOptions,
    monthOptions,
    weekOptions,
} from "./common";
import dayjs from "dayjs";
import { RecordId } from "surrealdb";

const schedulingOptions: CheckboxGroupProps<string>["options"] = [
    { value: "current", label: "Current Period" },
    { value: "previous", label: "Previous Period" },
];
// 11e3bbf1-39cc-4864-8384-ea99cbf09077

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

const defaultJobs: JobRequest = {
    id: "",
    jobName: "",
    data: {
        periodType: "month",
        processor: "alma-dhis2",
    },
    jobOptions: {},
    lastRun: "",
    nextRun: "",
    progress: "",
    status: "idle",
    isActive: false,
};

export function createTypedForm() {
    const [form] = Form.useForm<JobRequest>();
    const Field = <K extends keyof JobRequest>({
        name,
        ...props
    }: {
        name: K;
    } & Omit<React.ComponentProps<typeof Form.Item>, "name">) => (
        <Form.Item name={name} {...props} />
    );

    const NestedField = <
        K1 extends keyof JobRequest,
        K2 extends keyof NonNullable<JobRequest[K1]>,
    >({
        name,
        ...props
    }: {
        name: [K1, K2];
    } & Omit<React.ComponentProps<typeof Form.Item>, "name">) => (
        <Form.Item name={name} {...props} />
    );
    const DeepField = <
        K1 extends keyof JobRequest,
        K2 extends keyof NonNullable<JobRequest[K1]>,
        K3 extends keyof NonNullable<NonNullable<JobRequest[K1]>[K2]>,
    >({
        name,
        ...props
    }: {
        name: [K1, K2, K3];
    } & Omit<React.ComponentProps<typeof Form.Item>, "name">) => (
        <Form.Item name={name} {...props} />
    );
    return {
        form,
        Field,
        NestedField,
        DeepField,
        useWatch: Form.useWatch,
    };
}

export function App() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [current, setCurrent] = useState<JobRequest>(defaultJobs);
    const { form, Field, NestedField, DeepField, useWatch } = createTypedForm();

    const periodType = useWatch(["data", "periodType"], form);
    const handleStart = async (job: JobRequest) => {
        try {
            setIsEditing(true);
            setCurrent(job);
            const request = new Request(`/api/jobs/${job.id}/start`, {
                method: "POST",
                body: JSON.stringify(job),
            });
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        throw new Error("Something went wrong on API server!");
                    }
                })
                .then((response) => updateUI(response.job, true))
                .catch((error) => {
                    console.error(error);
                });
        } catch (err) {}
    };

    const handleStop = async (job: JobRequest) => {
        try {
            setIsEditing(() => true);
            setCurrent(job);
            const request = new Request(`/api/jobs/${job.id}/stop`, {
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
                .then((response) => updateUI(response.job, true))
                .catch((error) => {
                    console.error(error);
                });
        } catch (err) {}
    };

    const handleDelete = async (job: JobRequest) => {
        setIsEditing(() => true);
        setCurrent(job);
        if (window.confirm("Are you sure you want to delete this job?")) {
            try {
                const request = new Request(`/api/jobs/${job.id}`, {
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
                    .then((response) => updateUI(response.job, true, true))
                    .catch((error) => {
                        console.error(error);
                    });
            } catch (err) {}
        }
    };

    const startEdit = (job: JobRequest) => {
        setIsEditing(() => true);
        setCurrent(() => ({
            ...job,
            data: {
                ...job.data,
                period: job.data.period
                    ? job.data.period.map((p: string) => dayjs(p))
                    : undefined,
            },
        }));
        setIsModalOpen(() => true);
    };

    const columns: TableColumnsType<JobRequest> = [
        {
            title: "Id",
            dataIndex: "id",
        },
        { title: "Job Name", dataIndex: "jobName" },
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
                        percent={Number(row.progress)}
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
                        {row.isActive ? (
                            <button
                                onClick={() => handleStop(row)}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                                title="Stop"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleStart(row)}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                                title="Start"
                            >
                                <Play className="w-4 h-4" />
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

    const { isPending, hasErrors, errors, jobs, processors, instances } =
        useQueries({
            queries: [
                {
                    queryKey: ["jobs"],
                    queryFn: () => fetch("/api/jobs").then((res) => res.json()),
                    refetchInterval: 60_000,
                },
                {
                    queryKey: ["processors"],
                    queryFn: () =>
                        fetch("/api/processors").then((res) => res.json()),
                },
                {
                    queryKey: ["instances"],
                    queryFn: () =>
                        fetch("/api/instances").then((res) => res.json()),
                },
            ],
            combine: (results) => {
                const isPending = results.some((result) => result.isPending);
                const hasErrors = results.some((result) => result.isError);
                const errors = results
                    .filter((result) => result.isError)
                    .map((result) => result.error);

                let jobs: JobRequest[] = [];
                let processors: string[] = [];
                let instances: {
                    dhis2Instances: string[];
                    almaInstances: string[];
                } = {
                    dhis2Instances: [],
                    almaInstances: [],
                };

                if (!isPending && !hasErrors) {
                    const [
                        {
                            data: { jobs: currentJobs },
                        },
                        {
                            data: { processors: currentProcessors },
                        },
                        {
                            data: {
                                dhis2Instances: currentDhis2Instances,
                                almaInstances: currentAlmaInstances,
                            },
                        },
                    ] = results;

                    jobs = currentJobs;
                    processors = currentProcessors;
                    instances = {
                        dhis2Instances: currentDhis2Instances,
                        almaInstances: currentAlmaInstances,
                    };
                }

                return {
                    jobs,
                    processors,
                    instances,
                    isPending,
                    hasErrors,
                    errors,
                };
            },
        });

    const handleCancel = () => {
        setIsModalOpen(false);
    };
    const updateUI = (job: JobRequest, editing: boolean, remove = false) => {
        queryClient.setQueryData<{ jobs: JobRequest[] }>(["jobs"], (prev) => {
            if (prev && editing === true) {
                return {
                    jobs: prev.jobs.flatMap((s) => {
                        if (s.id && job && job.id && s.id === job.id) {
                            if (remove) {
                                return [];
                            }
                            return {
                                ...s,
                                ...job,
                            };
                        }
                        return s;
                    }),
                };
            } else if (editing === false) {
                if (prev) {
                    return {
                        jobs: prev.jobs.concat(job),
                    };
                } else {
                    return { jobs: [job] };
                }
            }

            return prev;
        });
    };

    const onCreate = (values: JobRequest) => {
        let request = new Request("/api/jobs", {
            method: "POST",
            body: JSON.stringify(values),
        });
        if (isEditing) {
            request = new Request(`/api/jobs/${current.id}`, {
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
            .then((response) => updateUI(response.job, isEditing))
            .catch((error) => {
                console.error(error);
            });
        setIsModalOpen(() => false);
        setCurrent(() => defaultJobs);
    };

    if (isPending) return "Loading...";

    if (hasErrors)
        return (
            "An error has occurred: " + errors.map((e) => e.message).join(", ")
        );
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
                        setCurrent(() => ({
                            ...defaultJobs,
                            id: uuidv4(),
                        }));
                        setIsEditing(false);
                        setIsModalOpen(true);
                    }}
                >
                    Add job
                </Button>
            </Flex>
            <Modal
                title="Job Configuration"
                open={isModalOpen}
                okButtonProps={{ autoFocus: true, htmlType: "submit" }}
                onCancel={handleCancel}
                width="75%"
                modalRender={(dom) => (
                    <Form
                        layout="vertical"
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
                <Flex justify="space-between" gap="20px">
                    <Flex vertical flex={1}>
                        <Field
                            children={<Input disabled />}
                            name="id"
                            label="Job ID"
                            rules={[{ required: true }]}
                        />
                        <Field
                            children={<Input />}
                            name="jobName"
                            label="Job Name"
                            rules={[{ required: true }]}
                        />
                        <NestedField
                            children={
                                <Select
                                    options={processors.map((p) => ({
                                        label: p,
                                        value: p,
                                    }))}
                                />
                            }
                            label="Processor"
                            name={["data", "processor"]}
                            rules={[{ required: true }]}
                        />
                        <NestedField
                            children={
                                <Select
                                    options={instances.dhis2Instances.map(
                                        (p) => ({
                                            label: p,
                                            value: p,
                                        }),
                                    )}
                                />
                            }
                            label="DHIS2 Instance"
                            name={["data", "dhis2Instance"]}
                            rules={[{ required: true }]}
                        />
                        <NestedField
                            children={
                                <Select
                                    options={instances.almaInstances.map(
                                        (p) => ({
                                            label: p,
                                            value: p,
                                        }),
                                    )}
                                />
                            }
                            label="Alma Instance"
                            name={["data", "almaInstance"]}
                            rules={[{ required: true }]}
                        />
                        <NestedField
                            children={<InputNumber style={{ width: "100%" }} />}
                            label="Scorecard"
                            name={["data", "scorecard"]}
                            rules={[{ required: true }]}
                        />

                        <NestedField
                            children={
                                <Select
                                    options={[
                                        {
                                            label: "Daily",
                                            value: "day",
                                        },
                                        {
                                            label: "Weekly",
                                            value: "week",
                                        },
                                        {
                                            label: "Monthly",
                                            value: "month",
                                        },
                                        {
                                            label: "Quarterly",
                                            value: "quarter",
                                        },
                                        {
                                            label: "Yearly",
                                            value: "year",
                                        },
                                    ]}
                                />
                            }
                            label="Period Type"
                            name={["data", "periodType"]}
                            rules={[{ required: true }]}
                        />
                        <NestedField
                            children={
                                <DatePicker
                                    picker={periodType}
                                    style={{ width: "100%" }}
                                    multiple
                                />
                            }
                            label="Specific Period"
                            name={["data", "period"]}
                            dependencies={["data", "periodType"]}
                        />
                        <NestedField
                            children={<Input />}
                            label="Indicator Group"
                            name={["data", "indicatorGroup"]}
                            rules={[{ required: true }]}
                        />
                    </Flex>

                    <Flex vertical flex={1}>
                        <NestedField
                            name={["data", "scheduled"]}
                            label="Schedule"
                            children={<Switch />}
                            valuePropName="checked"
                        />
                        <Form.Item
                            noStyle
                            shouldUpdate={(prevValues, currentValues) =>
                                prevValues.data.scheduled !==
                                currentValues.data.scheduled
                            }
                        >
                            {({ getFieldValue }) =>
                                getFieldValue(["data", "scheduled"]) ? (
                                    <>
                                        <Form.Item
                                            label="Cron Expression"
                                            rules={[{ required: true }]}
                                            children={
                                                <Flex justify="space-between">
                                                    <DeepField
                                                        children={
                                                            <Select
                                                                maxTagCount={1}
                                                                mode="multiple"
                                                                options={
                                                                    minuteOptions
                                                                }
                                                            />
                                                        }
                                                        name={[
                                                            "data",
                                                            "schedule",
                                                            "minutes",
                                                        ]}
                                                        label="Minute"
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        rules={[
                                                            { required: true },
                                                        ]}
                                                    />
                                                    <DeepField
                                                        children={
                                                            <Select
                                                                maxTagCount={1}
                                                                mode="multiple"
                                                                options={
                                                                    hourOptions
                                                                }
                                                            />
                                                        }
                                                        name={[
                                                            "data",
                                                            "schedule",
                                                            "hours",
                                                        ]}
                                                        label="Hour"
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        rules={[
                                                            { required: true },
                                                        ]}
                                                    />

                                                    <DeepField
                                                        children={
                                                            <Select
                                                                maxTagCount={1}
                                                                mode="multiple"
                                                                options={
                                                                    dayOptions
                                                                }
                                                            />
                                                        }
                                                        name={[
                                                            "data",
                                                            "schedule",
                                                            "days",
                                                        ]}
                                                        label="Day of Month"
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        rules={[
                                                            { required: true },
                                                        ]}
                                                    />

                                                    <DeepField
                                                        children={
                                                            <Select
                                                                maxTagCount={1}
                                                                mode="multiple"
                                                                options={
                                                                    monthOptions
                                                                }
                                                            />
                                                        }
                                                        name={[
                                                            "data",
                                                            "schedule",
                                                            "months",
                                                        ]}
                                                        label="Month"
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        rules={[
                                                            { required: true },
                                                        ]}
                                                    />

                                                    <DeepField
                                                        children={
                                                            <Select
                                                                maxTagCount={1}
                                                                mode="multiple"
                                                                options={
                                                                    weekOptions
                                                                }
                                                            />
                                                        }
                                                        name={[
                                                            "data",
                                                            "schedule",
                                                            "daysOfWeek",
                                                        ]}
                                                        label="Day of Week"
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        rules={[
                                                            { required: true },
                                                        ]}
                                                    />
                                                </Flex>
                                            }
                                        />

                                        <NestedField
                                            name={["data", "runFor"]}
                                            children={
                                                <Radio.Group
                                                    options={schedulingOptions}
                                                />
                                            }
                                            label="Run Schedule For"
                                            rules={[
                                                {
                                                    required: true,
                                                },
                                            ]}
                                        />
                                        <DeepField
                                            name={[
                                                "jobOptions",
                                                "repeat",
                                                "immediately",
                                            ]}
                                            label="Run Immediately"
                                            children={<Switch />}
                                            valuePropName="checked"
                                        />
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(
                                                prevValues,
                                                currentValues,
                                            ) =>
                                                prevValues.jobOptions?.repeat
                                                    ?.immediately !==
                                                currentValues.jobOptions?.repeat
                                                    ?.immediately
                                            }
                                        >
                                            {({ getFieldValue }) =>
                                                !getFieldValue([
                                                    "jobOptions",
                                                    "repeat",
                                                    "immediately",
                                                ]) ? (
                                                    <>
                                                        <DeepField
                                                            name={[
                                                                "jobOptions",
                                                                "repeat",
                                                                "startDate",
                                                            ]}
                                                            label="Start Running on"
                                                            children={
                                                                <DatePicker
                                                                    style={{
                                                                        width: "100%",
                                                                    }}
                                                                />
                                                            }
                                                            rules={[
                                                                {
                                                                    required:
                                                                        true,
                                                                },
                                                            ]}
                                                        />
                                                        <DeepField
                                                            name={[
                                                                "jobOptions",
                                                                "repeat",
                                                                "endDate",
                                                            ]}
                                                            label="Stop Running on"
                                                            children={
                                                                <DatePicker
                                                                    style={{
                                                                        width: "100%",
                                                                    }}
                                                                />
                                                            }
                                                        />
                                                    </>
                                                ) : null
                                            }
                                        </Form.Item>
                                    </>
                                ) : null
                            }
                        </Form.Item>
                    </Flex>
                </Flex>
            </Modal>
            <Table
                columns={columns}
                dataSource={jobs}
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
