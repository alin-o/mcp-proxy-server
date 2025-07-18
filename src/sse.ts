import { createServer } from "./mcp-proxy.js";
// If you implement authentication in mcp-proxy.ts using verifyToken, you might still need this import:
// import { verifyToken } from "./token-utils.js";

const PORT = process.env.PORT || 3006;

const { server, cleanup } = await createServer();

// Start the FastMCP server with HTTP Stream transport
server.start({
  transportType: "httpStream",
  httpStream: {
    port: Number(PORT),
    // The default endpoint for httpStream is /mcp. If you need /sse, you can specify it:
    // endpoint: "/sse"
  },
}).then(() => {
  console.log(`FastMCP server is running on port ${PORT}`);
}).catch((error) => {
  console.error("Failed to start FastMCP server:", error);
  process.exit(1); // Exit if server fails to start
});

// Handle cleanup on process exit signals
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing FastMCP server and cleaning up clients');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing FastMCP server and cleaning up clients');
  await cleanup();
  process.exit(0);
});