// M0 MCP stub — Noop path only. Does not bind Gate Inbox or real Cursor.
const base = process.env.HARNESS_API_BASE ?? "http://127.0.0.1:8080";
console.log(JSON.stringify({ msg: "mcp-stub idle", adapter: process.env.ADAPTER ?? "noop", api: base }));
setInterval(() => {}, 1 << 30);
