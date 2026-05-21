/**
 * Recursive Comment Parser
 */
import { formatTimestamp } from './formatters.js';

export function parseCommentTree(commentsData, depth = 0, maxDepth = 3) {
  if (depth > maxDepth || !commentsData?.children) return [];

  return commentsData.children
    .filter((child) => child.kind !== 'more')
    .map((child) => {
      const { data } = child;
      if (!data) return null;

      const comment = {
        id: data.id,
        author: data.author || '[deleted]',
        body: data.body || '[deleted]',
        score: data.score || 0,
        created: formatTimestamp(data.created_utc),
        permalink: data.permalink,
        depth,
        replies: [],
      };

      if (data.replies?.data) {
        comment.replies = parseCommentTree(data.replies.data, depth + 1, maxDepth);
      }

      return comment;
    })
    .filter(Boolean);
}

export function renderCommentsMarkdown(comments, indent = '') {
  let md = '';
  for (const comment of comments) {
    md += `${indent}*   **u/${comment.author}** (${comment.score} pts | ${comment.created})\n`;
    const bodyLines = comment.body
      .split('\n')
      .map((line) => `${indent}    ${line}`)
      .join('\n');
    md += `${bodyLines}\n\n`;
    if (comment.replies?.length > 0) {
      md += renderCommentsMarkdown(comment.replies, `${indent}    `);
    }
  }
  return md;
}
