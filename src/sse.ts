import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./mcp-proxy.js";
import { verifyToken } from "./token-utils.js";
import cors from "cors";

const app = express();
app.use(cors());

const { server, cleanup } = await createServer();

let transport: SSEServerTransport;

// Middleware to verify bearer token
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // TODO: it seems that roo code does not send authorization header, so we accept it for now
  try {
    next();
  } catch (err) {
    res.sendStatus(403);
  }
  return;
  /*
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.sendStatus(401);
      return;
    }
    const token = authHeader.split(' ')[1];
  
    if (!token) {
      res.sendStatus(401);
      return;
    }
  
    try {
      verifyToken(token);
      next();
    } catch (err) {
      res.sendStatus(403);
      return;
    }*/
};

// Apply auth middleware to protected endpoints
app.get("/sse", authMiddleware, async (req, res) => {
  console.log("Received connection");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);

  server.onerror = (err) => {
    console.error(`Server onerror: ${err.stack}`)
  }

  server.onclose = async () => {
    console.log('Connection onclose')
    if (process.env.KEEP_SERVER_OPEN !== "1") {
      await cleanup();
      await server.close();
      process.exit(0);
    }
  };
});

app.post("/message", authMiddleware, async (req, res) => {
  console.log("Received message");
  if (transport)
    await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
