import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const statusMessage = document.getElementById("statusMessage") as HTMLDivElement;
const toolListElement = document.getElementById("toolList") as HTMLUListElement;
const detailsContent = document.getElementById("detailsContent") as HTMLDivElement;
const toolForm = document.getElementById("toolForm") as HTMLDivElement;
const executeButton = document.getElementById("executeButton") as HTMLButtonElement;
const saveButton = document.getElementById("saveButton") as HTMLButtonElement;
const resultsContent = document.getElementById("resultsContent") as HTMLPreElement;

let transport: SSEClientTransport;
let client: Client;
let toolMap = new Map<string, any>(); // Store full tool objects
let lastSelectedToolName: string | null = null;
const toolInputValues = new Map<string, { [key: string]: any }>(); // Store input values for each tool

const updateStatus = (message: string) => {
    statusMessage.textContent = message;
};

const connectAndPopulateTools = async () => {
    console.log("Starting MCP Browser Client...");
    try {
        updateStatus("Connecting to MCP proxy server...");

        transport = new SSEClientTransport(new URL("http://localhost:3006/sse"));
        client = new Client(
            {
                name: "browser-client",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        await client.connect(transport);
        updateStatus("Connected to MCP proxy server.");

        transport.onerror = (event: Event) => {
            console.error("SSE Transport error:", event);
            updateStatus(`Connection lost.`);
        };

        // Populate tool list
        const availableTools = await client.listTools({});
        if (availableTools.tools) {
            toolMap.clear(); // Clear existing tools
            toolListElement.innerHTML = ''; // Clear existing list items
            availableTools.tools.forEach((tool: any) => {
                toolMap.set(tool.name, tool);
                const listItem = document.createElement('li');
                listItem.textContent = tool.name;
                listItem.dataset.toolName = tool.name; // Store tool name for easy access
                listItem.addEventListener('click', () => selectTool(tool.name));
                toolListElement.appendChild(listItem);
            });
        }
    } catch (error) {
        updateStatus(`Connection error: ${(error as Error).message}.`);
        console.error("Client connection error:", error);
    }
};

const selectTool = (toolName: string) => {
    // Save current input values before rendering new form
    if (lastSelectedToolName) {
        const currentInputs: { [key: string]: any } = {};
        Array.from(toolForm.querySelectorAll('input')).forEach(input => {
            currentInputs[input.id] = input.value;
        });
        toolInputValues.set(lastSelectedToolName, currentInputs);
    }

    // Clear previous selection
    Array.from(toolListElement.children).forEach(li => li.classList.remove('selected'));

    // Set new selection
    const selectedListItem = toolListElement.querySelector(`[data-tool-name="${toolName}"]`);
    if (selectedListItem) {
        selectedListItem.classList.add('selected');
    }

    const selectedTool = toolMap.get(toolName);
    if (selectedTool) {
        detailsContent.innerHTML = `Tool: <strong>${selectedTool.name}</strong><br><br>Description: ${selectedTool.description || 'No description provided.'}`;
        resultsContent.textContent = ''; // Clear previous results
        renderToolForm(selectedTool);
    }
    lastSelectedToolName = toolName;
};

const renderToolForm = (tool: any) => {
    toolForm.innerHTML = ''; // Clear previous form
    const savedValues = toolInputValues.get(tool.name) || {};

    if (tool.inputSchema && tool.inputSchema.properties) {
        for (const propName in tool.inputSchema.properties) {
            const prop = tool.inputSchema.properties[propName];
            const isRequired = tool.inputSchema.required && tool.inputSchema.required.includes(propName);

            const label = document.createElement('label');
            label.textContent = `${propName}${isRequired ? ' *' : ''}: ${prop.description || ''}`;
            toolForm.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.id = propName; // Use propName as ID for easy access
            input.value = savedValues[propName] !== undefined ? savedValues[propName] : '';
            toolForm.appendChild(input);
        }
    }
};

executeButton.addEventListener('click', async () => {
    const selectedToolName = lastSelectedToolName;
    if (!selectedToolName) {
        updateStatus("Please select a tool first.");
        return;
    }

    const selectedTool = toolMap.get(selectedToolName);
    if (!selectedTool) {
        updateStatus("Selected tool not found.");
        return;
    }

    const params: { [key: string]: any } = {};
    let isValid = true;
    Array.from(toolForm.querySelectorAll('input')).forEach(input => {
        const propName = input.id;
        const propSchema = selectedTool.inputSchema.properties[propName];
        let value: any = input.value;

        // Basic type parsing based on schema type
        if (propSchema.type === 'number') {
            value = parseFloat(value);
            if (isNaN(value)) {
                updateStatus(`Error: Invalid number for ${propName}`);
                isValid = false;
                return;
            }
        } else if (propSchema.type === 'boolean') {
            value = value.toLowerCase() === 'true';
        } else if (propSchema.type === 'object' || propSchema.type === 'array') {
            try {
                value = JSON.parse(value);
            } catch (e) {
                updateStatus(`Error: Invalid JSON for ${propName}`);
                isValid = false;
                return;
            }
        }
        params[propName] = value;
    });

    if (!isValid) return;

    // Save current input values
    toolInputValues.set(selectedToolName, params);

    resultsContent.textContent = ''; // Clear previous results
    resultsContent.textContent = `Executing tool: ${selectedTool.name}\nParameters: ${JSON.stringify(params, null, 2)}\n`;
    updateStatus(`Executing ${selectedTool.name}...`);

    try {
        const toolResult = await client.callTool({
            name: selectedTool.name,
            arguments: params,
        });
        resultsContent.textContent += `Tool Result:\n${JSON.stringify(toolResult, null, 2)}\n`;
        updateStatus(`Execution of ${selectedTool.name} complete.`);
    } catch (error) {
        const errorMessage = (error as Error).message;
        resultsContent.textContent += `Tool execution error: ${errorMessage}\n`;
        updateStatus(`Error executing ${selectedTool.name}.`);
        console.error("Tool execution error:", error);
        // Check if the error is connection-related
        if (errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Request timed out')) {
            // Reconnect immediately if connection error
            connectAndPopulateTools();
        }
    }
});

saveButton.addEventListener('click', () => {
    const results = resultsContent.textContent;
    if (results) {
        const blob = new Blob([results], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mcp_results.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStatus('Results saved to mcp_results.txt');
    } else {
        updateStatus('No results to save.');
    }
});

// Initial connection attempt
connectAndPopulateTools();