import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as eventsource from "eventsource";

// Polyfill EventSource for the client-side
if (typeof global !== 'undefined' && !global.EventSource) {
    (global as any).EventSource = eventsource.EventSource;
}

async function runClient() {
    const transport = new SSEClientTransport(new URL("http://localhost:3006/sse"));
    const client = new Client(
        {
            name: "test-client",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    try {
        await client.connect(transport);
        console.log("Client connected to MCP proxy server.");

        // List available tools
        console.log("Listing available tools...");
        const availableTools = await client.listTools({});
        console.log("Available tools:", availableTools);

        // Add a delay after listing tools
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Example: Call puppeteer_navigate tool
        console.log("Navigating to example.com...");
        const navigateResult = await client.callTool({
            name: "puppeteer_navigate",
            arguments: { url: "https://example.com" },
        });
        console.log("Navigate result:", navigateResult);

        if (navigateResult.isError) {
            console.error("Navigation failed, stopping further execution.");
            return; // Stop execution if navigation fails
        }

        // Example: Call puppeteer_screenshot tool
        console.log("Taking screenshot...");
        const screenshotResult = await client.callTool({
            name: "puppeteer_screenshot",
            arguments: { name: "test_page", selector: "body", width: 1400, height: 1080 },
        });
        console.log("Screenshot result:", screenshotResult);

        // Example: Call puppeteer_get_console_logs tool
        console.log("Getting console logs...");
        const logsResult: any = await client.callTool({
            name: "puppeteer_get_console_logs",
            arguments: {}, // No arguments needed for this tool
        });
        console.log("Console logs:", logsResult.content[0].text);


    } catch (error) {
        console.error("Client error:", error);
    } finally {
        await client.close();
        console.log("Client disconnected.");
    }
}

runClient().catch(console.error); 