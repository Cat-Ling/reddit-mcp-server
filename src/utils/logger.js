import pino from 'pino';

// Define a structured logger using Pino
// Pino is high-performance and defaults to JSON output, which is standard for enterprise environments.
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    // In development, we might want pretty printing. In production, structured JSON is preferred.
    // Note: For MCP servers running over stdio, console.error is typically used for logs so it doesn't interfere with the stdout MCP protocol.
    // However, Pino's default is stdout. We need to route logs to stderr for MCP compatibility.
  },
  pino.destination(2),
); // 2 = stderr
