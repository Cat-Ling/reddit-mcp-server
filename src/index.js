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
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  FrontpageSchema,
  SubredditPostsSchema,
  PostDetailsSchema,
  SearchSchema,
  SubredditAboutSchema,
  UserProfileSchema,
} from './tools/schemas.js';

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
        inputSchema: zodToJsonSchema(FrontpageSchema),
      },
      {
        name: 'reddit_get_subreddit_posts',
        description: 'Retrieve posts from a specific subreddit.',
        inputSchema: zodToJsonSchema(SubredditPostsSchema),
      },
      {
        name: 'reddit_get_post_details',
        description: 'Retrieve details and comments for a specific post.',
        inputSchema: zodToJsonSchema(PostDetailsSchema),
      },
      {
        name: 'reddit_search',
        description:
          'Search for posts across Reddit or discover matching communities. Natively supports search operators like flair_name:"News".',
        inputSchema: zodToJsonSchema(SearchSchema),
      },
      {
        name: 'reddit_get_subreddit_about',
        description:
          'Fetch deep subreddit info including rules, active users, community icons, and full sidebar widgets/markdown.',
        inputSchema: zodToJsonSchema(SubredditAboutSchema),
      },
      {
        name: 'reddit_get_user_profile',
        description: 'Fetch user profile and recent activity.',
        inputSchema: zodToJsonSchema(UserProfileSchema),
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
