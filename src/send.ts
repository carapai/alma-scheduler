import { Schedule } from "./interfaces";
import { queryDHIS2 } from "./utils";
// import { db } from "./db";
const runManually = async (id: string) => {
    const schedule: Partial<Schedule> = {
        id,
        name: "Monthly",
        cronExpression: "58 13 * * *",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastRun: new Date(),
        nextRun: null,
        lastStatus: "",
        progress: 23.41269841269841,
        status: "idle",
        retryAttempts: 0,
        maxRetries: 3,
        retryDelay: 60,
        message: "",
        scorecard: 1421,
        periodType: "monthly",
        indicatorGroup: "SWDeaw0RUyR",
    };
    // await queryDHIS2(schedule, "202501");
};

runManually("13002d4e-2240-4ec3-be3f-fc7d9df12796");
