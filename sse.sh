
#!/bin/bash

export DOCKER_CONTAINER=0
export JWT_SECRET="jbGllbnRJZCI6InRlc3QtY2xpZWntIiwiaWF0IjoxNzQzMjYwOTY5LCJleHAiOj"
export KEEP_SERVER_OPEN=1
export PUPPETEER_ARGS='{"defaultViewport": {"width": 1400, "height": 1080}, "args": ["--no-sandbox", "--no-zygote"], "headless": false, "timeout": 60000}'
export CHROME_DEVEL_SANDBOX='/opt/google/chrome/chrome-sandbox'
export DISPLAY=':0'
export SCREENSHOT_SAVE_PATH="/home/alin/ai-workspace/screenshots"

tsx build/sse
# node build/generate-token.js -c test-client -e 1y
