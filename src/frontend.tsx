import "@ant-design/v5-patch-for-react-19";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const queryClient = new QueryClient();

function start() {
    const root = createRoot(document.getElementById("root")!);
    root.render(
        <ConfigProvider
            theme={{
                token: {
                    borderRadius: 0,
                },
            }}
        >
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </ConfigProvider>,
    );
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
} else {
    start();
}
