import { Layout } from "antd";
import React from "react";

const { Header } = Layout;

export const AppHeader: React.FC = () => {
    return (
        <Header
            style={{
                backgroundColor: "white",
                borderBottom: "1px solid #d9d9d9",
                padding: "0 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            <div style={{ display: "flex", alignItems: "center" }}>
                <div
                    style={{
                        fontSize: "20px",
                        fontWeight: "bold",
                        color: "#262626",
                    }}
                >
                    ALMA Scheduler
                </div>
            </div>
        </Header>
    );
};
