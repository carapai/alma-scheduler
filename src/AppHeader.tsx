import {
    LogoutOutlined,
    SettingOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { Avatar, Dropdown, Layout, Space, Tooltip } from "antd";
import React from "react";
import { useAuth } from "./AuthContext";

const { Header } = Layout;

export const AppHeader: React.FC = () => {
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        logout();
    };

    const userMenuItems = [
        {
            key: "profile",
            icon: <UserOutlined />,
            label: "Profile",
        },
        {
            key: "settings",
            icon: <SettingOutlined />,
            label: "Settings",
        },
        {
            type: "divider" as const,
        },
        {
            key: "logout",
            icon: <LogoutOutlined />,
            label: "Logout",
            onClick: handleLogout,
        },
    ];

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

            <div style={{ display: "flex", alignItems: "center" }}>
                {user && (
                    <Space size="large">
                        <span
                            style={{
                                fontSize: "14px",
                                color: "#262626",
                                fontWeight: 500,
                            }}
                        >
                            Welcome, {user.username}
                        </span>
                        <Tooltip title={`${user.username} (${user.role})`}>
                            <Dropdown
                                menu={{ items: userMenuItems }}
                                trigger={["click"]}
                                placement="bottomRight"
                            >
                                <Avatar
                                    size={36}
                                    icon={<UserOutlined />}
                                    style={{
                                        backgroundColor: "#1677ff",
                                        cursor: "pointer",
                                    }}
                                />
                            </Dropdown>
                        </Tooltip>
                    </Space>
                )}
            </div>
        </Header>
    );
};
