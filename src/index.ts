#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { createServer } from "./mcp-proxy.js";

async function main() {
  const { server, cleanup } = await createServer();

  server.start({
    transportType: "stdio",
  }).then(() => {
    console.log(`FastMCP server is running with stdio transport`);
  }).catch((error) => {
    console.error("Failed to start FastMCP server:", error);
    process.exit(1); // Exit if server fails to start
  });

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log('SIGINT signal received: closing FastMCP server and cleaning up clients');
    await cleanup();
    // FastMCP server handles its own closing when transport is closed
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing FastMCP server and cleaning up clients');
    await cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});