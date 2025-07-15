import axios, { AxiosInstance } from "axios";
import { JobProgress, JobsOptions } from "bullmq";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

dayjs.extend(quarterOfYear);
dayjs.extend(advancedFormat);

const file = Bun.file("configuration.json");
const {
    "dhis2-instances": dhisInstances,
    "alma-instances": almaInstances,
}: {
    "dhis2-instances": Record<string, { username: string; password: string }>;
    "alma-instances": Record<
        string,
        { username: string; password: string; backend: string }
    >;
} = await file.json();

export type JobRequest = {
    id?: string;
    jobName: string;
    data: Record<string, any>;
    jobOptions: JobsOptions;
    lastRun?: string;
    nextRun?: string;
    progress?: string;
    status?: string;
    isActive?: boolean;
    cronExpression?: string;
};

export async function downloadCSV({
    indicator,
    level,
    period,
    indicatorName,
    current,
    total,
    scorecard,
    dhis2Api,
    almaInstance,
}: {
    indicator: string;
    level: number;
    period: string;
    indicatorName: string;
    current: number;
    total: number;
    scorecard: number;
    dhis2Api: AxiosInstance;
    almaInstance: string;
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
            almaInstance,
        });
    } catch (error) {
        console.log(error);
    }
}

export const sendToAlma = async ({
    data,
    scorecard,
    name,
    almaInstance,
}: {
    data: unknown;
    scorecard: number;
    name: string;
    almaInstance: string;
}) => {
    if (!almaInstances[almaInstance]) {
        throw new Error(`No alma instance found for ${almaInstance}`);
    }
    const almaApi = axios.create({
        baseURL: almaInstance,
    });
    const response = await almaApi.post("session", almaInstances[almaInstance]);
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

export const queryDHIS2 = async (
    data: Record<string, any>,
    updateProgress: (progress: JobProgress) => Promise<void>,
) => {
    const {
        scorecard,
        periodType,
        indicatorGroup,
        period,
        dhis2Instance,
        runFor,
				almaInstance
    } = data;
		console.log("queryDHIS2", data);
    if (!dhisInstances[dhis2Instance]) {
        throw new Error(`No dhis2 instance found for ${dhis2Instance}`);
    }
    const dhis2Api = axios.create({
        baseURL: dhis2Instance,
        auth: dhisInstances[dhis2Instance],
    });
    let format = "YYYYMM";
    let unit: dayjs.QUnitType = periodType;
    let valueToSubtract: number = runFor === "previous" ? 1 : 0;

    if (periodType === "quarter") {
        format = "YYYY[Q]Q";
    } else if (periodType === "year") {
        format = "YYYY";
    } else if (periodType === "week") {
        format = "YYYY[W]WW";
    } else if (periodType === "month") {
        format = "YYYYMM";
    } else if (periodType === "day") {
        format = "YYYYMMDD";
    }

    let availablePeriod = [
        dayjs().subtract(valueToSubtract, unit).format(format),
    ];

    if (period && period.length > 0 && periodType) {
        availablePeriod = period.map((p: any) => dayjs(p).format(format));
    }
    if (scorecard) {
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
        }>(`indicatorGroups/${indicatorGroup}/indicators.json`, {
            params: {
                fields: "id,name,numerator,denominator,decimals,indicatorType[id,name],annualized",
            },
        });
        const totalIterations = 6 * indicators.length * availablePeriod.length;
        let count = 0;
        for (const p of availablePeriod) {
            for (let level = 1; level <= 6; level++) {
                for (const [index, x] of indicators.entries()) {
                    count++;
                    console.log(
                        `Processing ${
                            x.name
                        } for period ${p} at level ${level} (${index + 1}/${
                            indicators.length
                        })`,
                    );
                    await downloadCSV({
                        indicator: x.id,
                        indicatorName: x.name,
                        level,
                        period: p,
                        current: index + 1,
                        total: indicators.length,
                        scorecard: Number(scorecard),
                        dhis2Api,
                        almaInstance,
                    });
                    const progress = (count / totalIterations) * 100;
                    console.log(`Progress: ${progress.toFixed(2)}%`);
                    await updateProgress(progress);
                }
            }
        }

        console.log("Job completed at:", new Date().toISOString());
    }
};
