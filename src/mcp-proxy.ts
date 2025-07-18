import { FastMCP, UserError } from "fastmcp";
import { z } from "zod";
import {
  ListToolsResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesResultSchema,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { createClients, ConnectedClient } from './client.js';
import { loadConfig } from './config.js';
import * as eventsource from 'eventsource';

// Polyfill EventSource for undici if needed
global.EventSource = eventsource.EventSource;

// Maps to track which client owns which resource
const toolToClientMap = new Map<string, ConnectedClient>();
const resourceToClientMap = new Map<string, ConnectedClient>();
const promptToClientMap = new Map<string, ConnectedClient>();
const resourceTemplateToClientMap = new Map<string, ConnectedClient>();

export const createServer = async () => {
  // Load configuration and connect to servers
  const config = await loadConfig();
  const connectedClients = await createClients(config.servers);
  console.log(`Connected to ${connectedClients.length} servers`);

  const server = new FastMCP({
    name: "mcp-proxy-server",
    version: "1.0.0",
    // You can add an 'authenticate' function here if you need to verify incoming requests
    // For example, to verify a bearer token:
    // authenticate: async (request) => {
    //   const authHeader = request.headers['authorization'];
    //   if (authHeader && authHeader.startsWith('Bearer ')) {
    //     const token = authHeader.split(' ')[1];
    //     try {
    //       verifyToken(token); // Assuming verifyToken is imported from token-utils.ts
    //       return { isAuthenticated: true }; // Return session data
    //     } catch (e) {
    //       throw new Response(null, { status: 401, statusText: 'Unauthorized' });
    //     }s
    //   }
    //   return {}; // No authentication, or return default session data
    // }
  });

  // Populate tools, prompts, resources, and resource templates from connected clients
  await Promise.all(connectedClients.map(async (connectedClient) => {
    try {
      // Fetch and add tools
      const toolsResult = await connectedClient.client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema
      );
      if (toolsResult.tools) {
        for (const tool of toolsResult.tools) {
          toolToClientMap.set(tool.name, connectedClient);
          server.addTool({
            name: tool.name,
            description: `[${connectedClient.name}] ${tool.description || ''}`,
            parameters: z.object({}).passthrough(), // Placeholder: dynamically generate schema from tool.inputSchema if needed
            execute: async (args, context) => {
              console.log('Forwarding tool call:', tool.name);
              console.log('Tool call arguments:', JSON.stringify(args, null, 2));
              const toolResult = await connectedClient.client.request(
                {
                  method: 'tools/call',
                  params: {
                    name: tool.name,
                    arguments: args || {},
                    // _meta is handled by FastMCP's internal progress/streaming mechanisms
                  }
                },
                CompatibilityCallToolResultSchema
              );
              console.log('Tool call result:', JSON.stringify(toolResult, null, 2));
              // Convert backend result to FastMCP's expected ContentResult format
              if (Array.isArray(toolResult.content)) {
                return { content: toolResult.content };
              } else if (toolResult.text) {
                return { content: [{ type: 'text', text: toolResult.text }] };
              }
              return { content: [] }; // Return empty content result
            }
          });
        }
      }
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        console.warn(`Client ${connectedClient.name} does not support tools/list method.`);
      } else {
        console.error(`Error fetching tools from ${connectedClient.name}:`, error);
      }
    }

    try {
      // Fetch and add prompts
      const promptsResult = await connectedClient.client.request(
        { method: 'prompts/list', params: {} },
        ListPromptsResultSchema
      );
      if (promptsResult.prompts) {
        for (const prompt of promptsResult.prompts) {
          promptToClientMap.set(prompt.name, connectedClient);
          server.addPrompt({
            name: prompt.name,
            description: `[${connectedClient.name}] ${prompt.description || ''}`,
            arguments: prompt.arguments?.map(arg => ({
              name: arg.name,
              description: arg.description,
              required: arg.required,
              enum: arg.enum as string[] | undefined, // Explicitly cast to string[] | undefined
              // You can add 'complete' function here if the backend prompt supports it
              // complete: async (value) => { /* Implement completion logic */ return { values: [] }; }
            })),
            load: async (args) => {
              console.log('Forwarding prompt request:', prompt.name);
              const response = await connectedClient.client.request(
                {
                  method: 'prompts/get' as const,
                  params: {
                    name: prompt.name,
                    arguments: args || {},
                    // _meta is handled by FastMCP's internal progress/streaming mechanisms
                  }
                },
                GetPromptResultSchema
              );
              console.log('Prompt result:', response);
              return response;
            }
          });
        }
      }
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        console.warn(`Client ${connectedClient.name} does not support prompts/list method.`);
      } else {
        console.error(`Error fetching prompts from ${connectedClient.name}:`, error);
      }
    }

    try {
      // Fetch and add resources
      const resourcesResult = await connectedClient.client.request(
        { method: 'resources/list', params: {} },
        ListResourcesResultSchema
      );
      if (resourcesResult.resources) {
        for (const resource of resourcesResult.resources) {
          resourceToClientMap.set(resource.uri, connectedClient);
          server.addResource({
            uri: resource.uri,
            name: `[${connectedClient.name}] ${resource.name || ''}`,
            mimeType: resource.mimeType,
            load: async () => {
              const result = await connectedClient.client.request(
                {
                  method: 'resources/read',
                  params: {
                    uri: resource.uri,
                    // _meta is handled by FastMCP's internal progress/streaming mechanisms
                  }
                },
                ReadResourceResultSchema
              );
              if (result.contents && result.contents.length > 0) {
                const content = result.contents[0];
                if (typeof content.text === 'string') {
                  return { text: content.text, mimeType: content.mimeType };
                } else if (typeof content.blob === 'string') {
                  return { blob: content.blob, mimeType: content.mimeType };
                }
              }
              throw new UserError(`Failed to load resource: ${resource.uri}`);
            }
          });
        }
      }
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        console.warn(`Client ${connectedClient.name} does not support resources/list method.`);
      } else {
        console.error(`Error fetching resources from ${connectedClient.name}:`, error);
      }
    }

    try {
      // Fetch and add resource templates
      const resourceTemplatesResult = await connectedClient.client.request(
        { method: 'resources/templates/list', params: {} },
        ListResourceTemplatesResultSchema
      );
      if (resourceTemplatesResult.resourceTemplates) {
        for (const template of resourceTemplatesResult.resourceTemplates) {
          resourceTemplateToClientMap.set(template.uriTemplate, connectedClient);
          server.addResourceTemplate({
            uriTemplate: template.uriTemplate,
            name: `[${connectedClient.name}] ${template.name || ''}`,
            description: `[${connectedClient.name}] ${template.description || ''}`,
            mimeType: template.mimeType,
            arguments: (template.arguments as any[] || []).map((arg: any) => ({
              name: arg.name,
              description: arg.description,
              required: arg.required,
              // You can add 'complete' function here if the backend template supports it
              // complete: async (value) => { /* Implement completion logic */ return { values: [] }; }
            })),
            load: async (args) => {
              // Construct the URI from the template and arguments
              const uri = template.uriTemplate.replace(/\{(\w+)\}/g, (_, key) => args[key]);
              const result = await connectedClient.client.request(
                {
                  method: 'resources/read', // Resource templates are read via resources/read
                  params: {
                    uri: uri,
                    // _meta is handled by FastMCP's internal progress/streaming mechanisms
                  }
                },
                ReadResourceResultSchema
              );
              if (result.contents && result.contents.length > 0) {
                const content = result.contents[0];
                if (typeof content.text === 'string') {
                  return { text: content.text, mimeType: content.mimeType };
                } else if (typeof content.blob === 'string') {
                  return { blob: content.blob, mimeType: content.mimeType };
                }
              }
              throw new UserError(`Failed to load resource template: ${template.uriTemplate}`);
            }
          });
        }
      }
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        console.warn(`Client ${connectedClient.name} does not support resources/templates/list method.`);
      } else {
        console.error(`Error fetching resource templates from ${connectedClient.name}:`, error);
      }
    }
  }));

  const cleanup = async () => {
    await Promise.all(connectedClients.map(({ cleanup }) => cleanup()));
  };

  return { server, cleanup };
};