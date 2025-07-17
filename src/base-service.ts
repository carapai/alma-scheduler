import { Surreal } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";

export abstract class BaseService {
    protected db: Surreal;
    protected isConnected = false;
    protected isInitialized = false;

    constructor() {
        this.db = new Surreal({
            engines: surrealdbNodeEngines(),
        });
    }

    async connect() {
        if (!this.isConnected) {
            await this.db.connect("surrealkv://scheduler", {
                database: "scheduler",
                namespace: "scheduler",
            });
            this.isConnected = true;
            if (!this.isInitialized) {
                await this.initializeSchema();
                this.isInitialized = true;
            }
        }
    }

    async disconnect() {
        if (this.isConnected) {
            await this.db.close();
            this.isConnected = false;
        }
    }

    protected abstract initializeSchema(): Promise<void>;
}