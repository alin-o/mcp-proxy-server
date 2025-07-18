The standard way to identify clients across different MCP endpoints is to use a unique client identifier, typically the `node.id` from the MCP `RequestResources` message.

The client is responsible for presenting this same identifier in all its communications, whether it's establishing the listening channel or sending a message.

---

### The Standard MCP Workflow

Here's the typical flow that allows the server to link a client's requests on `/sse` and `/message`:

1.  **Initial Request (on `/message`):**

    - A new client sends its first request as an HTTP `POST` to your `/message` endpoint.
    - The body of this request contains an MCP `RequestResources` message. This message includes a `node` object, which has a unique `id` field (e.g., `node: { id: "proxy-instance-123" }`).
    - Your server parses this message, extracts the `node.id`, and creates an internal session or record for this client, noting which resources it has requested.

2.  **Establishing the SSE Connection (on `/sse`):**

    - To start receiving updates, the same client makes an HTTP `GET` request to your `/sse` endpoint.
    - Crucially, the client must include its unique ID in this request. The most common and straightforward way is via a **query parameter**:
      `GET /sse?node_id=proxy-instance-123`
    - Your server reads the `node_id` from the query string. It then looks up its internal records and associates this new, long-lived SSE connection with the session for `proxy-instance-123`.

3.  **Sending Updates and ACKs:**
    - When your server has a configuration update for `proxy-instance-123`, it pushes the data down the correct SSE connection it has stored.
    - When the client successfully applies the configuration, it sends an acknowledgement (ACK) back as a `POST` to the `/message` endpoint. This ACK message will **also** contain the `node: { id: "proxy-instance-123" }`, allowing your server to correctly mark the configuration as acknowledged for that specific client.

---

### Example Flow

Here is a step-by-step example:

1.  **Client ➡️ `POST /message`**

    - **Body:** `RequestResources` with `node: { id: "proxy-abc" }`

2.  **Server 🆔**

    - Receives the request, extracts `proxy-abc` as the identifier, and creates a session for it.

3.  **Client ➡️ `GET /sse?node_id=proxy-abc`**

    - Establishes the listening channel.

4.  **Server ✅**

    - Receives the request, reads the `node_id` from the query, and links this SSE connection to the "proxy-abc" session. It can now send this client its requested configurations.

5.  **Client ➡️ `POST /message`**

    - **Body:** `AckResources` with `node: { id: "proxy-abc" }` and the acknowledged version info.

6.  **Server ✅**
    - Receives the ACK and correctly updates the status for the "proxy-abc" session.

The key is that the **`node.id` acts as the session token**, linking the stateless "talking" channel (`/message`) with the stateful "listening" channel (`/sse`).
