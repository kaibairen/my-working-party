#!/usr/bin/env node
/** HTTP MCP glove entry. Injects x-harness-entry: mcp on Domain writes. */
import { main } from "./src/http-proxy.ts";

main();
