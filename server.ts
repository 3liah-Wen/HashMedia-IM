import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import crypto from "crypto";
import Database from "better-sqlite3";
import multer from "multer";

const db = new Database("hashmedia.db");
const upload = multer({ storage: multer.memoryStorage() });

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content (
    hash TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(node_id) REFERENCES nodes(id),
    FOREIGN KEY(content_hash) REFERENCES content(hash)
  );
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/nodes", (req, res) => {
    const nodes = db.prepare("SELECT * FROM nodes").all();
    res.json(nodes);
  });

  app.post("/api/nodes", (req, res) => {
    const { name, owner_email } = req.body;
    const id = crypto.randomBytes(4).toString("hex");
    db.prepare("INSERT INTO nodes (id, name, owner_email) VALUES (?, ?, ?)").run(id, name, owner_email);
    res.json({ id, name });
  });

  app.get("/api/nodes/:id", (req, res) => {
    const node = db.prepare("SELECT * FROM nodes WHERE id = ?").get(req.params.id);
    if (node) {
      res.json(node);
    } else {
      res.status(404).json({ error: "Node not found" });
    }
  });

  app.delete("/api/nodes/:id", (req, res) => {
    const { id } = req.params;
    
    // Delete messages first due to foreign key constraints
    db.prepare("DELETE FROM messages WHERE node_id = ?").run(id);
    const result = db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    
    if (result.changes > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Node not found" });
    }
  });

  app.get("/api/content/:hash", (req, res) => {
    const content = db.prepare("SELECT * FROM content WHERE hash = ?").get(req.params.hash);
    if (content) {
      res.json(content);
    } else {
      res.status(404).json({ error: "Content not found" });
    }
  });

  app.get("/api/media/:hash", (req, res) => {
    const content = db.prepare("SELECT * FROM content WHERE hash = ?").get(req.params.hash);
    if (content) {
      res.setHeader("Content-Type", content.type);
      res.send(content.data);
    } else {
      res.status(404).json({ error: "Media not found" });
    }
  });

  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const hash = crypto.createHash("md5").update(req.file.buffer).digest("hex");
    const existing = db.prepare("SELECT hash FROM content WHERE hash = ?").get(hash);

    if (!existing) {
      db.prepare("INSERT INTO content (hash, data, type) VALUES (?, ?, ?)").run(
        hash,
        req.file.buffer,
        req.file.mimetype
      );
    }

    res.json({ hash, type: req.file.mimetype });
  });

  // WebSocket Handling
  const nodePeers = new Map<string, Map<WebSocket, string>>(); // node_id -> Map<socket, sender_name>

  wss.on("connection", (ws) => {
    let currentNodeId: string | null = null;

    const broadcastPeers = (nodeId: string) => {
      const peers = nodePeers.get(nodeId);
      if (!peers) return;
      
      const peerList = Array.from(peers.values());
      const broadcastMsg = JSON.stringify({
        type: "peers",
        peers: peerList
      });

      peers.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastMsg);
        }
      });
    };

    const broadcastSystemMessage = (nodeId: string, text: string) => {
      const peers = nodePeers.get(nodeId);
      if (!peers) return;

      const msg = JSON.stringify({
        type: "chat",
        sender: "SYSTEM",
        text: text,
        timestamp: new Date().toISOString(),
        isSystem: true
      });

      peers.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    };

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join":
            currentNodeId = message.node_id;
            const senderName = message.sender || "Anonymous";
            
            if (!nodePeers.has(currentNodeId!)) {
              nodePeers.set(currentNodeId!, new Map());
            }
            nodePeers.get(currentNodeId!)!.set(ws, senderName);
            
            // Send history
            const history = db.prepare(`
              SELECT m.*, c.data as text, c.type as mime_type
              FROM messages m 
              JOIN content c ON m.content_hash = c.hash 
              WHERE m.node_id = ? 
              ORDER BY m.timestamp ASC 
              LIMIT 50
            `).all(currentNodeId);
            
            ws.send(JSON.stringify({ type: "history", messages: history }));
            
            // Broadcast updated peer list
            broadcastPeers(currentNodeId!);
            broadcastSystemMessage(currentNodeId!, `${senderName} joined the mesh.`);
            break;

          case "chat":
            if (!currentNodeId) return;
            
            const { sender, text, hash: providedHash, mime_type } = message;
            let finalHash = providedHash;
            
            if (!finalHash) {
              finalHash = crypto.createHash("md5").update(text || "").digest("hex");
              // Store content if new
              db.prepare("INSERT OR IGNORE INTO content (hash, data, type) VALUES (?, ?, ?)").run(finalHash, text, "text/plain");
            }

            // Store message
            db.prepare("INSERT INTO messages (node_id, sender_name, content_hash) VALUES (?, ?, ?)").run(currentNodeId, sender, finalHash);

            // Broadcast to node
            const broadcastMsg = JSON.stringify({
              type: "chat",
              sender,
              text,
              hash: finalHash,
              mime_type: mime_type || "text/plain",
              timestamp: new Date().toISOString()
            });

            nodePeers.get(currentNodeId)?.forEach((_, client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(broadcastMsg);
              }
            });
            break;
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    });

    ws.on("close", () => {
      if (currentNodeId && nodePeers.has(currentNodeId)) {
        const senderName = nodePeers.get(currentNodeId)!.get(ws);
        nodePeers.get(currentNodeId)!.delete(ws);
        broadcastPeers(currentNodeId);
        if (senderName) {
          broadcastSystemMessage(currentNodeId, `${senderName} disconnected.`);
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
