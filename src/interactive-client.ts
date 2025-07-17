import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as eventsource from "eventsource";
import blessed from "blessed";

// Polyfill EventSource for the client-side
if (typeof global !== 'undefined' && !global.EventSource) {
    (global as any).EventSource = eventsource.EventSource;
}

async function runInteractiveClient() {
    const transport = new SSEClientTransport(new URL("http://localhost:3006/sse"));
    const client = new Client(
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

    const screen = blessed.screen({
        smartCSR: true,
        title: "MCP Interactive Client",
        debug: true, // Enable debugging to help identify UI issues
    });

    // Create a box for the left sidebar (tools list)
    const toolList = blessed.list({
        parent: screen,
        width: "30%",
        height: "100%",
        left: 0,
        top: 0,
        border: "line",
        label: " Tools ",
        keys: true,
        vi: true,
        mouse: true,
        style: {
            fg: "white",
            selected: {
                bg: "blue",
            },
        },
    });

    // Create a box for the right panel (tool details, parameters)
    const detailsPanel = blessed.box({
        parent: screen,
        width: "70%",
        height: "70%", // Adjusted height
        left: "30%",
        top: 0,
        border: "line",
        label: " Details ",
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: " ",
        },
        style: {
            fg: "white",
        },
    });

    // Create a box for the results
    const resultsBox = blessed.box({
        parent: screen,
        width: "70%",
        height: "30%", // Remaining height
        left: "30%",
        top: "70%", // Positioned below detailsPanel
        border: "line",
        label: " Results ",
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: " ",
        },
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

    try {
        await client.connect(transport);
        statusLine.setContent("Connected to MCP proxy server.");
        screen.render();

        // Populate tool list
        const availableTools = await client.listTools({});
        if (availableTools.tools) {
            const toolMap = new Map<string, any>(); // Store full tool objects
            const toolNames: string[] = [];
            availableTools.tools.forEach((tool: any) => {
                toolNames.push(tool.name);
                toolMap.set(tool.name, tool);
            });

            toolList.setItems(toolNames);
            toolList.focus(); // Focus the tool list for keyboard navigation
            screen.render();

            // Store all focusable elements for tab navigation
            const focusableElements: blessed.Widgets.BlessedElement[] = [toolList];
            let currentFocusIndex = 0;
            let currentFormBox: blessed.Widgets.BoxElement | null = null; // Keep track of the current form box

            toolList.on('select', async (item: blessed.Widgets.ListElement, index: number) => {
                const selectedToolName = item.content;
                const selectedTool = toolMap.get(selectedToolName);

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
                        height: '100%', // Make it take full height of detailsPanel
                        content: `Tool: ${selectedTool.name}

Description: ${selectedTool.description || 'No description provided.'}`, // Initial content
                        scrollable: true, // Make formBox scrollable
                        alwaysScroll: true,
                        scrollbar: {
                            ch: ' ',
                        },
                    });
                    currentFormBox = formBox; // Store the new form box

                    let currentTop = 4; // Starting position for parameters, adjusted for new header
                    const inputBoxes: { [key: string]: blessed.Widgets.TextboxElement } = {};
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
                                inputOnFocus: true,
                                censor: false, // Ensure text is not hidden
                                style: {
                                    fg: 'yellow', // Changed to yellow for better contrast
                                    bg: 'blue',   // Changed background for better visibility
                                    focus: {
                                        bg: 'green', // Background color when focused
                                        fg: 'black', // Text color when focused - changed to black for better visibility
                                    },
                                },
                            });
                            inputBoxes[propName] = input;
                            currentToolInputs.push(input); // Add to current tool's inputs

                            currentTop += 2; // Move down for the next parameter
                        }
                    }

                    const executeButton = blessed.button({
                        parent: formBox,
                        top: currentTop + 1,
                        left: 2,
                        width: 10,
                        height: 1,
                        content: ' Execute ',
                        align: 'center',
                        valign: 'middle',
                        border: 'line',
                        style: {
                            fg: 'white',
                            bg: 'green',
                            focus: {
                                bg: 'blue',
                            },
                        },
                    });

                    executeButton.on('press', async () => {
                        resultsBox.setContent('Executing tool...');
                        screen.render();

                        const args: { [key: string]: any } = {};
                        for (const propName in inputBoxes) {
                            args[propName] = inputBoxes[propName].value;
                        }

                        try {
                            const result = await client.callTool({
                                name: selectedTool.name,
                                arguments: args,
                            });

                            resultsBox.setContent(`Tool Execution Result:\n${JSON.stringify(result, null, 2)}`);
                        } catch (error) {
                            resultsBox.setContent(`Tool Execution Error:\n${(error as Error).message}`);
                        } finally {
                            screen.render();
                        }
                    });

                    // Update focusable elements and set initial focus
                    focusableElements.length = 1; // Keep toolList
                    focusableElements.push(...currentToolInputs);
                    focusableElements.push(executeButton);

                    if (currentToolInputs.length > 0) {
                        currentToolInputs[0].focus();
                    } else {
                        executeButton.focus();
                    }
                    currentFocusIndex = 0; // Reset index to start from toolList for global tab

                    screen.render();
                }
            });

            // Global Tab Key Listener
            screen.key(['C-n', 'C-p'], (ch: string, key: any) => {
                if (focusableElements.length === 0) return;

                if (key.name === 'p') { // Ctrl+P for previous
                    currentFocusIndex = (currentFocusIndex - 1 + focusableElements.length) % focusableElements.length;
                } else { // Ctrl+N for next
                    currentFocusIndex = (currentFocusIndex + 1) % focusableElements.length;
                }

                focusableElements[currentFocusIndex].focus();
                screen.render();
            });
        }

    } catch (error) {
        statusLine.setContent(`Client error: ${(error as Error).message}`);
        screen.render();
        console.error("Client error:", error); // Log to stderr for debugging
    }

    screen.render();
}

runInteractiveClient().catch(console.error); 
