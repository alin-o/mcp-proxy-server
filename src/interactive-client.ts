import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as eventsource from "eventsource";
import blessed from "blessed";
import * as fs from "fs";

// Polyfill EventSource for the client-side
if (typeof global !== 'undefined' && !global.EventSource) {
    (global as any).EventSource = eventsource.EventSource;
}

async function runInteractiveClient() {
    let transport: SSEClientTransport;
    let client: Client;

    const screen = blessed.screen({
        smartCSR: true,
        title: "MCP Interactive Client",
        debug: true, // Enable debugging to help identify UI issues
    });

    // Create a box for the left sidebar (tools list)
    const toolList = blessed.list({
        parent: screen,
        width: 30,
        height: "100%",
        left: 0,
        top: 0,
        border: "line",
        label: " Tools ",
        keys: true,
        vi: true,
        mouse: true,
        style: {
            fg: "white", // Default foreground for items
            bg: "default", // Ensure the list background is default
            item: { // Style for unselected items
                fg: "white",
                bg: "default",
            },
            selected: { // Style for selected item when list is NOT focused
                bg: "blue",
                fg: "white",
            }
        },
    });

    // Define the styles for selected item when focused and not focused
    const selectedStyleUnfocused = {
        bg: "blue",
        fg: "white",
    };
    const selectedStyleFocused = {
        bg: "green",
        fg: "black",
    };

    toolList.on('focus', () => {
        toolList.style.selected = selectedStyleFocused;
        screen.render();
    });

    toolList.on('blur', () => {
        toolList.style.selected = selectedStyleUnfocused;
        screen.render();
    });

    // Create a box for the right panel (tool details, parameters)
    const detailsPanel = blessed.box({
        parent: screen,
        width: "100%-30",
        height: "50%", // Adjusted height
        left: 30,
        top: 0,
        border: "line",
        label: " Details ",
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: " ",
        },
        mouse: true, // Enable mouse interaction
        style: {
            fg: "white",
        },
    });

    // Create a box for the results
    const resultsBox = blessed.box({
        parent: screen,
        width: "100%-30",
        height: "50%", // Remaining height
        left: 30,
        top: "50%", // Positioned below detailsPanel
        border: "line",
        label: " Results ",
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: " ",
        },
        mouse: true, // Enable mouse interaction
        style: {
            fg: "white",
        },
    });

    // Add a message/status line at the bottom
    const statusLine = blessed.box({
        parent: screen,
        bottom: 0,
        left: 0,
        height: 1,
        width: "100%",
        style: {
            bg: "gray",
            fg: "black",
        },
        content: "Connecting...",
    });

    // Quit on Ctrl+C.
    screen.program.key(["C-c"], function (ch: string, key: any) {
        return process.exit(0);
    });
    screen.program.key(["C-x"], function (ch: string, key: any) {
        return process.exit(0);
    });

    screen.key(['escape'], function(ch: string, key: any) {
        // If an input is focused, cancel it
        if (screen.focused && (screen.focused as any).cancel) {
            (screen.focused as any).cancel();
            screen.focused.emit('blur'); // Manually emit blur to trigger blur logic
            screen.render();
        }
    });

    let isConnected = false;
    let reconnectInterval: NodeJS.Timeout | null = null;
    let toolMap = new Map<string, any>(); // Store full tool objects

    // Store all focusable elements for tab navigation
    let formFocusableElements: blessed.Widgets.BlessedElement[] = []; // Declare outside the select handler
    let currentFormBox: blessed.Widgets.BoxElement | null = null; // Keep track of the current form box
    const toolInputValues = new Map<string, { [key: string]: any }>(); // Store input values for each tool
    let lastSelectedToolName: string | null = null; // To store the name of the tool that was last selected
    let currentInputBoxes: { [key: string]: blessed.Widgets.TextboxElement } = {}; // Store input boxes for the currently displayed tool

    const connectAndPopulateTools = async () => {
        try {
            statusLine.setContent("Connecting to MCP proxy server...");
            screen.render();

            transport = new SSEClientTransport(new URL("http://localhost:3006/sse"));
            client = new Client(
                {
                    name: "interactive-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        tools: {},
                    },
                },
            );

            await client.connect(transport);
            isConnected = true;
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
            statusLine.setContent("Connected to MCP proxy server.");
            screen.render();

            // Reset toolList styles and interaction options upon successful connection
            toolList.style.fg = "white";
            toolList.style.selected.bg = "blue";
            toolList.style.selected.fg = "white";
            toolList.options.keys = true;
            (toolList as any).mouse = true;

            // Populate tool list
            const availableTools = await client.listTools({});
            if (availableTools.tools) {
                toolMap.clear(); // Clear existing tools
                const toolNames: string[] = [];
                availableTools.tools.forEach((tool: any) => {
                    toolNames.push(tool.name);
                    toolMap.set(tool.name, tool);
                });

                toolList.setItems(toolNames);
                toolList.focus(); // Focus the tool list for keyboard navigation
            }
        } catch (error) {
            isConnected = false;
            statusLine.setContent(`Connection error: ${(error as Error).message}. Retrying in 5 seconds...`);
            toolList.setItems([`Connection Error`]);
            toolList.style.fg = "red"; // Set foreground color to red for error message
            toolList.style.selected.bg = "red"; // Set selected background color to red
            toolList.style.selected.fg = "white"; // Set selected foreground color to white
            toolList.options.keys = false; // Disable keyboard interaction
            (toolList as any).mouse = false; // Disable mouse interaction
            screen.render();
            // console.error("Client connection error:", error); // Log to stderr for debugging

            if (!reconnectInterval) {
                reconnectInterval = setInterval(connectAndPopulateTools, 5000); // Retry every 5 seconds
            }
        }
        screen.render();
    };

    // Initial connection attempt
    connectAndPopulateTools();

    toolList.on('keypress', (ch: string, key: any) => {
        if (key.name === 'tab') {
            if (formFocusableElements.length > 0) {
                if (key.shift) {
                    // Shift+Tab from toolList goes to the last form element (execute button)
                    formFocusableElements[formFocusableElements.length - 1].focus();
                } else {
                    // Tab from toolList goes to the first form element
                    formFocusableElements[0].focus();
                }
                return false; // Prevent default tab behavior
            }
        }
    });
    screen.render();

    toolList.on('select', async (item: blessed.Widgets.ListElement, index: number) => {
        if (!isConnected) {
            // If not connected, do not allow tool selection
            return;
        }
        const selectedToolName = item.content;
        const selectedTool = toolMap.get(selectedToolName);

        // Save current input values before destroying the form
        if (lastSelectedToolName && Object.keys(currentInputBoxes).length > 0) {
            const previousToolInputValues: { [key: string]: any } = {};
            for (const propName in currentInputBoxes) {
                previousToolInputValues[propName] = currentInputBoxes[propName].value;
            }
            toolInputValues.set(lastSelectedToolName, previousToolInputValues);
        }

        if (selectedTool) {
            if (currentFormBox) {
                currentFormBox.destroy(); // Destroy the old form box
                currentFormBox = null;
            }
            resultsBox.setContent(''); // Clear previous results
            detailsPanel.setContent(''); // Clear previous content

            const formBox = blessed.box({
                parent: detailsPanel,
                top: 0,
                left: 0,
                width: '100%',
                height: 'shrink', // Changed to shrink
                content: `Tool: ${selectedTool.name}\n\nDescription: ${selectedTool.description || 'No description provided.'}`, // Initial content
                scrollable: true, // Make formBox scrollable
                alwaysScroll: true,
                scrollbar: {
                    ch: ' ',
                },
            });
            currentFormBox = formBox; // Store the new form box

            let currentTop = 4; // Starting position for parameters, adjusted for new header
            currentInputBoxes = {}; // Reset for the new tool
            const currentToolInputs: blessed.Widgets.TextboxElement[] = [];

            if (selectedTool.inputSchema && selectedTool.inputSchema.properties) {
                for (const propName in selectedTool.inputSchema.properties) {
                    const prop = selectedTool.inputSchema.properties[propName];
                    const isRequired = selectedTool.inputSchema.required && selectedTool.inputSchema.required.includes(propName);

                    const labelContent = `${propName}${isRequired ? ' *' : ''}: ${prop.description || ''}`;

                    blessed.text({
                        parent: formBox,
                        top: currentTop,
                        left: 2,
                        content: labelContent,
                    });

                    const input = blessed.textbox({
                        parent: formBox,
                        top: currentTop + 1,
                        left: 2,
                        height: 1,
                        width: '80%',
                        //inputOnFocus: false, // Start with false
                        censor: false, // Ensure text is not hidden
                        mouse: true, // Enable mouse interaction
                        keys: true, // Enable keyboard input for navigation (arrow keys)
                        style: {
                            fg: 'white',
                            bg: 'blue',
                            focus: {
                                bg: 'green',
                                fg: 'black',
                            },
                        },
                    });

                    input.on('focus', () => {
                        input.readInput(); // Explicitly start reading input
                    });
                    currentInputBoxes[propName] = input;
                    currentToolInputs.push(input); // Add to current tool's inputs

                    // Set previous value if available
                    const savedValues = toolInputValues.get(selectedToolName);
                    if (savedValues && savedValues[propName] !== undefined) {
                        input.setValue(String(savedValues[propName]));
                    }

                    currentTop += 2; // Move down for the next parameter
                }
            }

            const executeButton = blessed.button({
                parent: formBox,
                top: currentTop + 1,
                left: 2,
                width: 12, // Increased width
                height: 1,
                content: ' Execute ',
                align: 'center',
                valign: 'middle',
                // border: 'line', // Removed border to match inputs
                mouse: true, // Enable mouse interaction
                keys: true, // Enable keyboard focus
                style: {
                    fg: 'yellow',
                    bg: 'blue',
                    focus: {
                        bg: 'green',
                        fg: 'black',
                    },
                },
            });

            const saveButton = blessed.button({
                parent: formBox,
                top: currentTop + 1,
                left: 16, // Position next to execute button
                width: 14,
                height: 1,
                content: ' Save Results ',
                align: 'center',
                valign: 'middle',
                mouse: true,
                keys: true,
                style: {
                    fg: 'yellow',
                    bg: 'blue',
                    focus: {
                        bg: 'green',
                        fg: 'black',
                    },
                },
            });

            // Collect all focusable elements in the form
            formFocusableElements = [...currentToolInputs, executeButton, saveButton]; // Assign to the outer-scoped variable

            currentToolInputs.forEach((input, index) => {
                input.on('keypress', (ch: string, key: any) => {
                    if (key.name === 'tab') {
                        if (key.shift) {
                            // Shift+Tab (backwards)
                            if (index === 0) { // If it's the first input element
                                toolList.focus(); // Focus the toolList
                            } else {
                                const prevIndex = (index - 1 + formFocusableElements.length) % formFocusableElements.length;
                                formFocusableElements[prevIndex].focus();
                            }
                        } else {
                            // Tab (forwards)
                            const nextIndex = (index + 1) % formFocusableElements.length;
                            formFocusableElements[nextIndex].focus();
                        }
                        screen.render(); // Re-render after focus change
                        return false; // Prevent default tab behavior
                    } else if (key.name === 'enter') {
                        const nextIndex = (index + 1) % formFocusableElements.length;
                        formFocusableElements[nextIndex].focus();
                        screen.render(); // Re-render after focus change
                        return false; // Prevent default enter behavior
                    }
                });
            });

            executeButton.on('keypress', (ch: string, key: any) => {
                if (key.name === 'tab') {
                    const currentIndex = formFocusableElements.indexOf(executeButton);
                    if (key.shift) {
                        // Shift+Tab (backwards)
                        const prevIndex = (currentIndex - 1 + formFocusableElements.length) % formFocusableElements.length;
                        formFocusableElements[prevIndex].focus();
                    } else {
                        // Tab (forwards)
                        // From execute button, go to save button
                        const nextIndex = (currentIndex + 1) % formFocusableElements.length;
                        formFocusableElements[nextIndex].focus();
                    }
                    screen.render(); // Re-render after focus change
                    return false; // Prevent default tab behavior
                }
            });

            saveButton.on('keypress', (ch: string, key: any) => {
                if (key.name === 'tab') {
                    const currentIndex = formFocusableElements.indexOf(saveButton);
                    if (key.shift) {
                        // Shift+Tab (backwards)
                        const prevIndex = (currentIndex - 1 + formFocusableElements.length) % formFocusableElements.length;
                        formFocusableElements[prevIndex].focus();
                    } else {
                        // Tab (forwards)
                        // From save button, go back to toolList
                        toolList.focus();
                    }
                    screen.render(); // Re-render after focus change
                    return false; // Prevent default tab behavior
                }
            });

            executeButton.removeAllListeners('press');
            executeButton.on('press', async () => {
                const params: { [key: string]: any } = {};
                for (const propName in currentInputBoxes) {
                    const input = currentInputBoxes[propName];
                    const propSchema = selectedTool.inputSchema.properties[propName];
                    let value: any = input.value;

                    // Basic type parsing based on schema type
                    if (propSchema.type === 'number') {
                        value = parseFloat(value);
                        if (isNaN(value)) {
                            resultsBox.setContent(`Error: Invalid number for ${propName}`);
                            screen.render();
                            return;
                        }
                    } else if (propSchema.type === 'boolean') {
                        value = value.toLowerCase() === 'true';
                    } else if (propSchema.type === 'object' || propSchema.type === 'array') {
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            resultsBox.setContent(`Error: Invalid JSON for ${propName}`);
                            screen.render();
                            return;
                        }
                    }
                    params[propName] = value;
                }

                // Save current input values
                toolInputValues.set(selectedToolName, params);

                resultsBox.setContent(`Executing tool: ${selectedTool.name}\nParameters: ${JSON.stringify(params, null, 2)}\n`);
                screen.render();

                try {
                    const toolResult = await client.callTool({
                        name: selectedTool.name,
                        arguments: params,
                    });
                    resultsBox.setContent(resultsBox.getContent() + `Tool Result:\n${JSON.stringify(toolResult, null, 2)}\n`);
                } catch (error) {
                    const errorMessage = (error as Error).message;                    
                    resultsBox.setContent(resultsBox.getContent() + `Tool execution error: ${errorMessage}\n`);
                    // Check if the error is connection-related
                    if (errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch') || errorMessage.includes('ECONNREFUSED')) {
                        isConnected = false; // Mark connection as potentially broken
                        connectAndPopulateTools();
                    }
                }
                screen.render();
            });

            saveButton.removeAllListeners('press');
            saveButton.on('press', () => {
                const resultsContent = resultsBox.getContent();
                const filePath = 'mcp_results.txt';
                try {
                    fs.writeFileSync(filePath, resultsContent);
                    statusLine.setContent(`Results saved to ${filePath}`);
                } catch (error) {
                    statusLine.setContent(`Error saving results: ${(error as Error).message}`);
                }
                screen.render();
            });

            screen.render();
        }
        lastSelectedToolName = selectedToolName; // Update last selected tool name
    });

    // Global Key Listener (for toolList and general navigation if needed)
    screen.key(['C-c'], function (ch: string, key: any) {
        return process.exit(0);
    });

    screen.render();
}

runInteractiveClient().catch(console.error); 
