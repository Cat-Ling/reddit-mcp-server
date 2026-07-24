# Reddit MCP Server

Model Context Protocol (MCP) server for Reddit data access. Supports OAuth2, public JSON feeds, and HTML scraping.

## Features

*   **Tiered Fetching**: Official API → Public JSON → HTML Scraper.
*   **Data Coverage**: Recursive comment trees, native video/gallery detection, and subreddit rules.
*   **Caching**: TTL-based in-memory cache for rate-limit mitigation.
*   **Validation**: Zod-based tool argument validation.
*   **Logging**: Pino structured logging to stderr.

## Tools

| Tool | Description |
| :--- | :--- |
| `reddit_get_frontpage` | Browse popular, all, or home feeds with sorting and pagination. |
| `reddit_get_subreddit_posts` | Retrieve posts from specific subreddits (e.g., `r/rust`). |
| `reddit_get_post_details` | Fetch details, media, and nested comment trees. (Supports full untruncated text bypass). |
| `reddit_search` | Global or subreddit-restricted keyword search. |
| `reddit_get_subreddit_about` | Fetch subreddit rules, stats, and metadata. |
| `reddit_get_user_profile` | View public user karma and recent activity. |

## Configuration

### Environment Variables

| Variable | Description |
| :--- | :--- |
| `REDDIT_CLIENT_ID` | (Optional) API Client ID. |
| `REDDIT_CLIENT_SECRET` | (Optional) API Client Secret. |
| `LOG_LEVEL` | Logging level (`info`, `debug`, `error`). |

## Installation

### NPX
```bash
npx github:Cat-Ling/reddit-mcp-server
```

### Local
```bash
git clone https://github.com/Cat-Ling/reddit-mcp-server.git
cd reddit-mcp-server
npm install
npm start
```

## Setup (Claude Desktop or Cline)

You can install this directly via `npx` (recommended) or locally. Add the following to your `claude_desktop_config.json`:

### Option 1: Using NPX (Recommended - Zero Install)
```json
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["-y", "github:Cat-Ling/reddit-mcp-server"],
      "env": {
        "REDDIT_CLIENT_ID": "your_id",
        "REDDIT_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

### Option 2: Running Locally
```json
{
  "mcpServers": {
    "reddit": {
      "command": "node",
      "args": ["/absolute/path/to/reddit-mcp-server/src/index.js"],
      "env": {
        "REDDIT_CLIENT_ID": "your_id",
        "REDDIT_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

## License
MIT
