import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const statusMessage = document.getElementById("statusMessage") as HTMLDivElement;
const toolListElement = document.getElementById("toolList") as HTMLUListElement;
const detailsContent = document.getElementById("detailsContent") as HTMLDivElement;
const toolForm = document.getElementById("toolForm") as HTMLDivElement;
const executeButton = document.getElementById("executeButton") as HTMLButtonElement;
const saveButton = document.getElementById("saveButton") as HTMLButtonElement;
const resultsContent = document.getElementById("resultsContent") as HTMLPreElement;
const toolSearchInput = document.getElementById("toolSearchInput") as HTMLInputElement;

const setExecuteButtonVisibility = (visible: boolean) => {
    executeButton.style.display = visible ? 'inline-block' : 'none';
};

setExecuteButtonVisibility(false); // Initially hide the button

let transport: SSEClientTransport;
let client: Client;
let toolMap = new Map<string, any>(); // Store full tool objects
let allTools: any[] = []; // Store all tools for filtering
let lastSelectedToolName: string | null = null;
const toolInputValues = new Map<string, { [key: string]: any }>(); // Store input values for each tool
let clientId = `browser-client-${Math.random().toString(36).substring(2, 15)}`; // Generate a unique client ID

const generateNewClientId = () => {
    clientId = `browser-client-${Math.random().toString(36).substring(2, 15)}`;
};

const RECONNECT_INTERVAL_MS = 5000; // 5 seconds
let reconnectAttemptTimer: number | null = null;

const updateStatus = (message: string) => {
    statusMessage.textContent = message;
};

const attemptReconnect = () => {
    setExecuteButtonVisibility(false);
    toolForm.innerHTML = '';
    if (reconnectAttemptTimer) {
        clearTimeout(reconnectAttemptTimer);
        reconnectAttemptTimer = null;
    }
    updateStatus(`Attempting to reconnect in ${RECONNECT_INTERVAL_MS / 1000} seconds...`);
    reconnectAttemptTimer = setTimeout(connectAndPopulateTools, RECONNECT_INTERVAL_MS) as unknown as number;
};

const connectAndPopulateTools = async () => {
    console.log("Starting MCP Browser Client...");
    updateStatus("Connecting to MCP proxy server...");

    // Explicitly close the existing transport if it exists
    if (transport) {
        await transport.close();
    }

    // Generate a new client ID for each connection attempt
    generateNewClientId();

    // Always re-create transport and client instances
    transport = new SSEClientTransport(new URL(`http://localhost:3006/sse?node_id=${clientId}`));
    client = new Client(
        {
            name: "browser-client",
            version: "1.0.0",
            id: clientId, // Use the generated client ID as node.id
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    transport.onerror = (error: Error) => {
        console.error("SSE Transport error:", error);
        updateStatus(`Connection lost.`);
        attemptReconnect();
    };

    try {
        await client.connect(transport);
        updateStatus("Connected to MCP proxy server.");
        console.log("Connected to MCP proxy server.");

        if (reconnectAttemptTimer) {
            clearTimeout(reconnectAttemptTimer);
            reconnectAttemptTimer = null;
        }

        // Clear existing tools before populating
        toolMap.clear();
        allTools = [];
        toolListElement.innerHTML = '';

        // Populate tool list
        const availableTools = await client.listTools({});
        if (availableTools.tools) {
            allTools = availableTools.tools; // Store all tools
            filterTools(); // Populate initial list            
        }
    } catch (error) {
        updateStatus(`Connection error: ${(error as Error).message}.`);
        console.error("Client connection error:", error);
        attemptReconnect();
    }
};

const filterTools = () => {
    toolMap.clear();
    toolListElement.innerHTML = '';
    const searchTerm = toolSearchInput.value.toLowerCase();

    const filteredTools = allTools.filter(tool =>
        tool.name.toLowerCase().includes(searchTerm) ||
        (tool.description && tool.description.toLowerCase().includes(searchTerm))
    );

    filteredTools.forEach((tool: any) => {
        toolMap.set(tool.name, tool);
        const listItem = document.createElement('li');
        listItem.textContent = tool.name;
        listItem.dataset.toolName = tool.name;
        listItem.addEventListener('click', () => selectTool(tool.name));
        toolListElement.appendChild(listItem);
    });
};

toolSearchInput.addEventListener('keyup', filterTools);

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
        saveButton.style.display = 'none'; // Hide save button

        renderToolForm(selectedTool);
    } else {
        setExecuteButtonVisibility(false); // Hide execute button if no tool is selected
    }
    lastSelectedToolName = toolName;
};

const renderToolForm = (tool: any) => {
    toolForm.innerHTML = '';
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

    setExecuteButtonVisibility(true);

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
    saveButton.style.display = 'none'; // Hide save button before execution
    resultsContent.textContent = `Executing tool: ${selectedTool.name}\nParameters: ${JSON.stringify(params, null, 2)}\n`;
    updateStatus(`Executing ${selectedTool.name}...`);

    try {
        const toolResult = await client.callTool({
            name: selectedTool.name,
            arguments: params,
        });
        resultsContent.textContent += `Tool Result:\n${JSON.stringify(toolResult, null, 2)}\n`;
        updateStatus(`Execution of ${selectedTool.name} complete.`);
        if (resultsContent.textContent.trim() !== '') {
            saveButton.style.display = 'inline-block'; // Show save button if results are available
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        resultsContent.textContent += `Tool execution error: ${errorMessage}\n`;
        updateStatus(`Error executing ${selectedTool.name}.`);
        console.error("Tool execution error:", error);
        // Reconnect immediately if connection error
        if (errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Request timed out')) {
            connectAndPopulateTools();
        } else if (errorMessage.includes('No active transport')) {
            console.error("RECONNECT: ", error);
            attemptReconnect();
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