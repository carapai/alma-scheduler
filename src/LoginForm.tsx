import React, { useState } from "react";
import { Form, Input, Button, Alert, Card, Typography } from "antd";
import { UserOutlined, LockOutlined, LoadingOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

interface LoginFormProps {
    onLogin: (userData: any) => Promise<void>;
    onRegister?: (userData: any) => void;
}

interface LoginFormData {
    username: string;
    password: string;
}

interface RegisterFormData {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({
    onLogin,
    onRegister,
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isRegisterMode, setIsRegisterMode] = useState(false);

    const handleLogin = async (values: LoginFormData) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(values),
            });

            const data = await response.json();

            if (response.ok) {
                await onLogin(data);
            } else {
                setError(data.error || "Login failed");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: RegisterFormData) => {
        if (values.password !== values.confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: values.username,
                    email: values.email,
                    password: values.password,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                if (onRegister) {
                    onRegister(data);
                } else {
                    await onLogin(data);
                }
            } else {
                setError(data.error || "Registration failed");
            }
        } catch (err) {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                minWidth: "100vw",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f5f5f5",
                padding: "24px",
            }}
        >
            <Card style={{ width: "100%", maxWidth: "400px" }}>
                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <Title level={2}>
                        {isRegisterMode ? "Create Account" : "Sign In"}
                    </Title>
                    <Text type="secondary">
                        {isRegisterMode
                            ? "Sign up for ALMA Scheduler"
                            : "Sign in to your account"}
                    </Text>
                </div>

                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ marginBottom: "16px" }}
                    />
                )}

                {!isRegisterMode ? (
                    <Form
                        name="login"
                        onFinish={handleLogin}
                        layout="vertical"
                        size="large"
                    >
                        <Form.Item
                            name="username"
                            rules={[
                                {
                                    required: true,
                                    message: "Please input your username!",
                                },
                            ]}
                        >
                            <Input
                                prefix={
                                    <UserOutlined
                                        style={{ color: "#bfbfbf" }}
                                    />
                                }
                                placeholder="Username"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            rules={[
                                {
                                    required: true,
                                    message: "Please input your password!",
                                },
                            ]}
                        >
                            <Input.Password
                                prefix={
                                    <LockOutlined
                                        style={{ color: "#bfbfbf" }}
                                    />
                                }
                                placeholder="Password"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                block
                                loading={loading}
                                icon={loading ? <LoadingOutlined /> : undefined}
                            >
                                {loading ? "Signing in..." : "Sign In"}
                            </Button>
                        </Form.Item>
                    </Form>
                ) : (
                    <Form
                        name="register"
                        onFinish={handleRegister}
                        layout="vertical"
                        size="large"
                    >
                        <Form.Item
                            name="username"
                            rules={[
                                {
                                    required: true,
                                    message: "Please input your username!",
                                },
                                {
                                    min: 3,
                                    message:
                                        "Username must be at least 3 characters!",
                                },
                            ]}
                        >
                            <Input
                                prefix={
                                    <UserOutlined
                                        style={{ color: "#bfbfbf" }}
                                    />
                                }
                                placeholder="Username"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item
                            name="email"
                            rules={[
                                {
                                    required: true,
                                    message: "Please input your email!",
                                },
                                {
                                    type: "email",
                                    message: "Please enter a valid email!",
                                },
                            ]}
                        >
                            <Input
                                prefix={
                                    <UserOutlined style={{ color: "#bfbfbf" }} />
                                }
                                placeholder="Email"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            rules={[
                                {
                                    required: true,
                                    message: "Please input your password!",
                                },
                                {
                                    min: 6,
                                    message:
                                        "Password must be at least 6 characters!",
                                },
                            ]}
                        >
                            <Input.Password
                                prefix={
                                    <LockOutlined
                                        style={{ color: "#bfbfbf" }}
                                    />
                                }
                                placeholder="Password"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item
                            name="confirmPassword"
                            rules={[
                                {
                                    required: true,
                                    message: "Please confirm your password!",
                                },
                            ]}
                        >
                            <Input.Password
                                prefix={
                                    <LockOutlined style={{ color: "#bfbfbf" }} />
                                }
                                placeholder="Confirm Password"
                                disabled={loading}
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                block
                                loading={loading}
                                icon={loading ? <LoadingOutlined /> : undefined}
                            >
                                {loading
                                    ? "Creating Account..."
                                    : "Create Account"}
                            </Button>
                        </Form.Item>
                    </Form>
                )}

                <div style={{ textAlign: "center", marginTop: "16px" }}>
                    <Text type="secondary">
                        {isRegisterMode
                            ? "Already have an account?"
                            : "Don't have an account?"}
                    </Text>
                    <Button
                        type="link"
                        onClick={() => {
                            setIsRegisterMode(!isRegisterMode);
                            setError(null);
                        }}
                        style={{ padding: 0, marginLeft: "4px" }}
                    >
                        {isRegisterMode ? "Sign in" : "Sign up"}
                    </Button>
                </div>

                <div style={{ marginTop: "24px", textAlign: "center" }}>
                    <Text style={{ fontSize: "12px" }} type="secondary">
                        Default admin credentials: admin / admin123
                    </Text>
                </div>
            </Card>
        </div>
    );
};
