import axios from "axios";
import { db } from "@/db";
import { Schedule } from "@/interfaces";
import dayjs from "dayjs";
export const almaApi = axios.create({
    baseURL: String(process.env.BASE_URL),
});

export const dhis2Api = axios.create({
    baseURL: process.env.DHIS2_URL,
    auth: {
        username: String(process.env.DHIS2_USERNAME),
        password: String(process.env.DHIS2_PASSWORD),
    },
});

export async function downloadCSV({
    indicator,
    level,
    period,
    indicatorName,
    current,
    total,
    scorecard,
}: {
    indicator: string;
    level: number;
    period: string;
    indicatorName: string;
    current: number;
    total: number;
    scorecard: number;
}) {
    const params = new URLSearchParams({});
    params.append("dimension", `dx:${indicator}`);
    params.append("dimension", `pe:${period}`);
    params.append("dimension", `ou:LEVEL-${level}`);

    const name = `for ${indicatorName} for ${period} for ${level}(${current}/${total})...`;
    console.log(`Downloading data ${name}`);
    const url = `analytics.json?dimension=dx:${indicator}&dimension=pe:${period}&dimension=ou:LEVEL-${level}`;
    try {
        const { data: data2 } = await dhis2Api.get(url);

        const response = await sendToAlma({
            data: data2,
            scorecard,
            name,
        });
        console.log(response);
    } catch (error) {
        console.log(error);
    }
}

export const sendToAlma = async ({
    data,
    scorecard,
    name,
}: {
    data: unknown;
    scorecard: number;
    name: string;
}) => {
    const response = await almaApi.post("session", {
        backend: String(process.env.BACKEND),
        username: String(process.env.USERNAME),
        password: String(process.env.PASSWORD),
    });
    const headers = response.headers["set-cookie"];
    if (headers) {
        try {
            const form = new FormData();
            const jsonBlob = new Blob(
                [JSON.stringify({ dataValues: [data] })],
                {
                    type: "application/json",
                },
            );
            form.append("file", jsonBlob, "temp.json");
            console.log(`Uploading data for ${name} to ALMA`);
            const { data: finalResponse } = await almaApi.put(
                `scorecard/${scorecard}/upload/dhis`,
                form,
                {
                    headers: { cookie: headers.join() },
                },
            );
            return finalResponse;
        } catch (error) {
            console.log(error);
        } finally {
        }
    }
    return {};
};

export const queryDHIS2 = async ({
    scorecard,
    id,
    status,
}: Partial<Schedule>): Promise<void> => {
    const period = dayjs().format("YYYYMM");
    if (id && scorecard && status !== "running") {
        const jobId = crypto.randomUUID();
        const startTime = new Date().toISOString();
        db.run(
            `INSERT INTO job_executions (id, scheduleId, startTime, status) VALUES (?, ?, ?, ?)`,
            [jobId, id, startTime, "running"],
        );
        db.run(
            `UPDATE schedules SET currentJobId = ?, status = 'running', progress = 0, message = 'Task started' WHERE id = ?`,
            [jobId, id],
        );
        db.run(`UPDATE schedules SET message = ? WHERE id = ?`, [
            "Fetching organisation units",
            id,
        ]);

        const {
            data: { indicators },
        } = await dhis2Api.get<{
            indicators: {
                id: string;
                name: string;
                numerator: string;
                denominator: string;
                decimals: number;
                annualized: boolean;
                indicatorType: { name: string; id: string };
            }[];
        }>(`indicatorGroups/SWDeaw0RUyR/indicators.json`, {
            params: {
                fields: "id,name,numerator,denominator,decimals,indicatorType[id,name],annualized",
            },
        });

        for (let level = 1; level <= 6; level++) {
            for (const [index, x] of indicators.entries()) {
                await downloadCSV({
                    indicator: x.id,
                    indicatorName: x.name,
                    level,
                    period,
                    current: index + 1,
                    total: indicators.length,
                    scorecard,
                });
            }
        }
        const endTime = new Date().toISOString();
        try {
            db.run(
                `UPDATE job_executions SET endTime = ?, status = ? WHERE id = ?`,
                [endTime, "completed", jobId],
            );
            db.run(
                `UPDATE schedules SET currentJobId = NULL, lastStatus = 'completed', status = 'completed', progress = 100, lastRun = ?, message = 'Task completed successfully' WHERE id = ?`,
                [endTime, id],
            );
        } catch (error) {
            console.log(error);
        }
    }
};
