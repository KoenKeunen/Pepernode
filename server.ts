import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Store active processes
  const processes = new Map();

  io.on("connection", (socket) => {
    console.log("Client connected to terminal");

    socket.on("run-command", async (data) => {
      const { command, args, actionId } = data;
      
      const child = spawn(command, args, {
        shell: true,
        env: { ...process.env, FORCE_COLOR: "true" }
      });

      processes.set(actionId, child);

      child.stdout.on("data", (data) => {
        socket.emit("terminal-data", { actionId, type: "stdout", content: data.toString() });
      });

      child.stderr.on("data", (data) => {
        socket.emit("terminal-data", { actionId, type: "stderr", content: data.toString() });
      });

      child.on("close", (code) => {
        socket.emit("terminal-data", { actionId, type: "exit", code });
        processes.delete(actionId);
      });
    });

    socket.on("kill-process", (actionId) => {
      const child = processes.get(actionId);
      if (child) {
        child.kill();
        processes.delete(actionId);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  // API to check dependencies
  app.get("/api/check-deps", async (req, res) => {
    const deps = [
      { name: "git", command: "git --version" },
      { name: "rustc", command: "rustc --version" },
      { name: "cargo", command: "cargo --version" },
      { name: "pkg-config", command: "pkg-config --version" },
      { name: "libasound2-dev", command: "dpkg -s libasound2-dev" },
    ];

    const results = await Promise.all(
      deps.map(async (dep) => {
        return new Promise((resolve) => {
          const child = spawn(dep.command, { shell: true });
          child.on("close", (code) => {
            resolve({ name: dep.name, installed: code === 0 });
          });
          child.on("error", () => {
            resolve({ name: dep.name, installed: false });
          });
        });
      })
    );

    res.json(results);
  });

  // Vite middle-man
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
