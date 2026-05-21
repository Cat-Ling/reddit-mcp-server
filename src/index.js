#!/usr/bin/env node

/**
 * reddit-mcp-server
 * Modular entry point for the Reddit MCP Server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { toolHandlers } from './tools/handlers.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';

const server = new Server(
  {
    name: 'reddit-mcp-server',
    version: '1.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Tool Definitions
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'reddit_get_frontpage',
        description: 'Browse standard Reddit frontpages (popular, all, home).',
        inputSchema: {
          type: 'object',
          properties: {
            feed: { type: 'string', enum: ['popular', 'all', 'home'], default: 'popular' },
            sort: { type: 'string', enum: ['hot', 'new', 'top', 'rising'], default: 'hot' },
            time: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              default: 'day',
            },
            limit: { type: 'number', default: 25 },
            after: { type: 'string' },
          },
        },
      },
      {
        name: 'reddit_get_subreddit_posts',
        description: 'Retrieve posts from a specific subreddit.',
        inputSchema: {
          type: 'object',
          properties: {
            subreddit: { type: 'string' },
            sort: { type: 'string', enum: ['hot', 'new', 'top', 'rising'], default: 'hot' },
            time: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              default: 'day',
            },
            limit: { type: 'number', default: 25 },
            after: { type: 'string' },
          },
          required: ['subreddit'],
        },
      },
      {
        name: 'reddit_get_post_details',
        description: 'Retrieve details and comments for a specific post.',
        inputSchema: {
          type: 'object',
          properties: {
            permalink: { type: 'string' },
            depth: { type: 'number', default: 3 },
            limit: { type: 'number', default: 50 },
          },
          required: ['permalink'],
        },
      },
      {
        name: 'reddit_search',
        description: 'Search for posts across Reddit.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            subreddit: { type: 'string' },
            sort: {
              type: 'string',
              enum: ['relevance', 'hot', 'top', 'new', 'comments'],
              default: 'relevance',
            },
            time: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              default: 'all',
            },
            limit: { type: 'number', default: 25 },
            after: { type: 'string' },
          },
          required: ['query'],
        },
      },
      {
        name: 'reddit_get_subreddit_about',
        description: 'Fetch stats and description for a subreddit.',
        inputSchema: {
          type: 'object',
          properties: {
            subreddit: { type: 'string' },
          },
          required: ['subreddit'],
        },
      },
      {
        name: 'reddit_get_user_profile',
        description: 'Fetch user profile and recent activity.',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            limit: { type: 'number', default: 20 },
          },
          required: ['username'],
        },
      },
    ],
  };
});

/**
 * Tool Execution Handler with Centralized Error Handling
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers[name];

  if (!handler) {
    logger.warn({ tool: name }, 'Requested tool not found');
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: Tool not found: ${name}` }],
    };
  }

  try {
    logger.info({ tool: name, args }, 'Executing tool');
    return await handler(args);
  } catch (err) {
    // Structured Logging
    logger.error({ tool: name, err: err.message, stack: err.stack }, 'Tool execution failed');

    // Safe Error formatting for client
    let userMessage = 'An internal error occurred during tool execution.';
    if (err instanceof AppError) {
      userMessage = err.message;
      if (err.details) {
        userMessage += `\nDetails: ${JSON.stringify(err.details)}`;
      }
    } else if (err.name === 'ZodError') {
      userMessage = `Validation Error: ${err.message}`;
    }

    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${userMessage}` }],
    };
  }
});

/**
 * Server Initialization
 */
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Reddit MCP Server (Modular v1.2.0) running.');
}

run().catch((err) => {
  logger.fatal({ err }, 'Startup Error');
  process.exit(1);
});
