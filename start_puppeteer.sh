#!/bin/bash
export PUPPETEER_ARGS='{"args": ["--no-sandbox", "--no-zygote"]}'
#'{"defaultViewport": {"width": 1400, "height": 1080}, "args": ["--no-sandbox", "--no-zygote"]}'
#export CHROME_DEVEL_SANDBOX='/opt/google/chrome/chrome-sandbox'
#export DISPLAY=:0
export SCREENSHOT_SAVE_PATH="/home/alin/ai-workspace/screenshots"
cd /home/alin/ai-workspace/mcp-configurable-puppeteer
#npx -y github:alin-o/mcp-configurable-puppeteer
#npx -y /home/alin/ai-workspace/mcp-configurable-puppeteer/dist/index.js
tsx index.ts
#node dist/index.js