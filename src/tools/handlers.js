/**
 * Tools Dispatcher
 */
import { fetchRedditWithFallback } from '../lib/api.js';
import { truncateText, formatPostMediaMarkdown, unescapeHtml } from '../utils/formatters.js';
import { parseCommentTree, renderCommentsMarkdown } from '../utils/comments.js';
import {
  FrontpageSchema,
  SubredditPostsSchema,
  PostDetailsSchema,
  SearchSchema,
  SubredditAboutSchema,
  UserProfileSchema,
} from './schemas.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Prepends diagnostic metadata to the markdown output to inform the AI
 * about the current access tier and any fallback events.
 */
function formatDiagnosticHeader(diagnostics) {
  let md = `> [!NOTE]\n`;
  md += `> **Access Mode**: ${diagnostics.mode}\n`;
  if (diagnostics.attempts?.length > 0) {
    md += `> **Fallback Events**:\n`;
    diagnostics.attempts.forEach((a) => {
      md += `> *   *Tier failed*: ${a.tier} (Error: ${a.error})\n`;
    });
  }
  md += `\n`;
  return md;
}

export const toolHandlers = {
  reddit_get_frontpage: async (rawArgs) => {
    const parseResult = FrontpageSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid arguments for reddit_get_frontpage',
        parseResult.error.format(),
      );
    }
    const args = parseResult.data;

    const { feed, sort, time, limit, after } = args;
    const path = `/${feed === 'home' ? '' : `r/${feed}`}/${sort}`;
    const query = { limit, t: time, after };

    const { data, diagnostics } = await fetchRedditWithFallback(path, query);
    const children = data.data?.children || [];

    let markdown = formatDiagnosticHeader(diagnostics);
    markdown += `# Reddit Frontpage: r/${feed} (${sort})\n\n`;
    children.forEach((post, i) => {
      const p = post.data;
      markdown += `### ${i + 1}. [${unescapeHtml(p.title)}](${p.url})\n`;
      markdown += `*   **r/${p.subreddit}** | u/${p.author} | Score: ${p.score}\n`;
      const media = formatPostMediaMarkdown(p);
      if (media.markdown) markdown += media.markdown;
      if (p.selftext) markdown += `\n> ${truncateText(p.selftext, 300).replace(/\n/g, '\n> ')}\n`;
      markdown += `\n---\n\n`;
    });

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },

  reddit_get_subreddit_posts: async (rawArgs) => {
    const parseResult = SubredditPostsSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid arguments for reddit_get_subreddit_posts',
        parseResult.error.format(),
      );
    }
    const args = parseResult.data;

    const subreddit = args.subreddit.trim().replace(/^r\//, '');
    const { sort, time, limit, after } = args;
    const path = `/r/${subreddit}/${sort}`;
    const query = { limit, t: time, after };

    const { data, diagnostics } = await fetchRedditWithFallback(path, query);
    const children = data.data?.children || [];

    let markdown = formatDiagnosticHeader(diagnostics);
    markdown += `# Subreddit: r/${subreddit} (${sort})\n\n`;
    children.forEach((post, i) => {
      const p = post.data;
      markdown += `### ${i + 1}. [${unescapeHtml(p.title)}](${p.url})\n`;
      markdown += `*   u/${p.author} | Score: ${p.score} | Comments: ${p.num_comments}\n`;
      const media = formatPostMediaMarkdown(p);
      if (media.markdown) markdown += media.markdown;
      if (p.selftext) markdown += `\n> ${truncateText(p.selftext, 300).replace(/\n/g, '\n> ')}\n`;
      markdown += `\n---\n\n`;
    });

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },

  reddit_get_post_details: async (rawArgs) => {
    const parseResult = PostDetailsSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid arguments for reddit_get_post_details',
        parseResult.error.format(),
      );
    }
    const args = parseResult.data;

    let { permalink } = args;
    const { depth, limit } = args;
    if (permalink.startsWith('http')) {
      try {
        permalink = new URL(permalink).pathname;
      } catch (e) {
        logger.warn({ permalink, err: e.message }, 'Failed to parse permalink URL');
      }
    }
    if (!permalink.startsWith('/')) permalink = `/${permalink}`;

    const { data, diagnostics } = await fetchRedditWithFallback(permalink, { depth, limit });
    const postData = data[0]?.data?.children?.[0]?.data;
    const commentsData = data[1]?.data;

    if (!postData) throw new Error('Post not found');

    const parsedComments = parseCommentTree(commentsData, 0, depth);
    let markdown = formatDiagnosticHeader(diagnostics);
    markdown += `# ${unescapeHtml(postData.title)}\n`;
    markdown += `*   r/${postData.subreddit} | u/${postData.author} | Score: ${postData.score}\n\n`;

    const media = formatPostMediaMarkdown(postData);
    if (media.markdown) markdown += `## Media\n${media.markdown}\n`;
    if (postData.selftext) {
      markdown += `## Content\n${
        args.truncate_content
          ? truncateText(postData.selftext, 4000)
          : unescapeHtml(postData.selftext)
      }\n\n`;
    }

    markdown += `## Comments\n\n${renderCommentsMarkdown(parsedComments) || '*No comments found.*'}`;

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },

  reddit_search: async (rawArgs) => {
    const parseResult = SearchSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError('Invalid arguments for reddit_search', parseResult.error.format());
    }
    const args = parseResult.data;

    const { query, subreddit, sort, time, limit, after } = args;
    const subPath = subreddit ? `/r/${subreddit.trim().replace(/^r\//, '')}` : '';
    const path = `${subPath}/search`;
    const queryParams = {
      q: query,
      sort,
      t: time,
      limit,
      after,
      restrict_sr: subreddit ? 'on' : 'off',
      include_over_18: 'on',
    };

    const { data, diagnostics } = await fetchRedditWithFallback(path, queryParams);
    const children = data.data?.children || [];

    let markdown = formatDiagnosticHeader(diagnostics);
    markdown += `# Search: "${query}"${subreddit ? ` in r/${subreddit}` : ''}\n\n`;

    // If global search, try to find matching subreddits too
    if (!subreddit) {
      try {
        const { data: subData } = await fetchRedditWithFallback('/subreddits/search', {
          q: query,
          limit: 3,
          include_over_18: 'on',
        });
        const subredditsFound = subData.data?.children || [];
        if (subredditsFound.length > 0) {
          markdown += `## Matching Subreddits\n`;
          subredditsFound.forEach((s) => {
            const p = s.data;
            if (!p.display_name) return;
            markdown += `*   **[r/${p.display_name}](https://reddit.com/r/${p.display_name})** - ${p.subscribers?.toLocaleString() || 0} subs\n`;
            if (p.public_description)
              markdown += `    > ${p.public_description.replace(/\n/g, ' ')}\n`;
          });
          markdown += `\n---\n\n`;
        }
      } catch (err) {
        logger.debug({ err: err.message }, 'Failed to fetch matching subreddits during search');
      }
    }

    markdown += `## Post Results\n\n`;
    children.forEach((post, i) => {
      const p = post.data;
      if (!p.title) return; // Skip non-post results
      markdown += `### ${i + 1}. [${unescapeHtml(p.title)}](https://reddit.com${p.permalink})\n`;
      markdown += `*   r/${p.subreddit} | u/${p.author} | Score: ${p.score}\n`;
      if (p.url && !p.url.includes(p.permalink)) {
        markdown += `*   🔗 **External Link**: ${p.url}\n`;
      }
      const media = formatPostMediaMarkdown(p);
      if (media.markdown) markdown += media.markdown;
      if (p.selftext) markdown += `\n> ${truncateText(p.selftext, 300).replace(/\n/g, '\n> ')}\n`;
      markdown += `---\n\n`;
    });

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },

  reddit_get_subreddit_about: async (rawArgs) => {
    const parseResult = SubredditAboutSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid arguments for reddit_get_subreddit_about',
        parseResult.error.format(),
      );
    }
    const args = parseResult.data;

    const subreddit = args.subreddit.trim().replace(/^r\//, '');
    const { data: aboutData, diagnostics: aboutDiag } = await fetchRedditWithFallback(
      `/r/${subreddit}/about`,
    );
    const { data: rulesData } = await fetchRedditWithFallback(`/r/${subreddit}/about/rules`);

    const d = aboutData.data || aboutData;
    const rules = rulesData.rules || [];

    let markdown = formatDiagnosticHeader(aboutDiag);
    markdown += `# About r/${d.display_name}\n\n`;

    let icon = d.community_icon || d.icon_img;
    if (icon) {
      icon = icon.split('?')[0].replace(/&amp;/g, '&'); // Clean up Reddit CDN URLs
      if (icon) markdown += `![Icon](${icon})\n\n`;
    }

    markdown += `*   **Title**: ${d.title}\n`;
    markdown += `*   **Subscribers**: ${d.subscribers?.toLocaleString() || 0}\n`;
    markdown += `*   **Active Users**: ${d.accounts_active?.toLocaleString() || 0}\n\n`;

    if (d.public_description && d.public_description !== d.description) {
      markdown += `## Public Description\n${d.public_description}\n\n`;
    }
    markdown += `## Sidebar Description\n${d.description || '*No description.*'}\n\n`;

    if (rules.length > 0) {
      markdown += `## Rules\n\n`;
      rules.forEach((rule, i) => {
        markdown += `### ${i + 1}. ${rule.short_name}\n${rule.description || ''}\n\n`;
      });
    }

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },

  reddit_get_user_profile: async (rawArgs) => {
    const parseResult = UserProfileSchema.safeParse(rawArgs || {});
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid arguments for reddit_get_user_profile',
        parseResult.error.format(),
      );
    }
    const args = parseResult.data;

    const { username, sort, time, limit } = args;
    const { data: aboutData, diagnostics: aboutDiag } = await fetchRedditWithFallback(
      `/user/${username}/about`,
    );
    const { data: submittedData } = await fetchRedditWithFallback(`/user/${username}/submitted`, {
      sort,
      t: time,
      limit,
    });
    const d = aboutData.data;

    let markdown = formatDiagnosticHeader(aboutDiag);
    markdown += `# User: u/${d.name}\n\n`;
    markdown += `*   **Karma**: ${((d.link_karma || 0) + (d.comment_karma || 0)).toLocaleString()}\n\n`;
    markdown += `## Recent Submissions\n\n`;
    submittedData.data?.children?.forEach((item, i) => {
      markdown += `${i + 1}. [${item.data.title}](https://reddit.com${item.data.permalink})\n`;
    });

    return {
      content: [{ type: 'text', text: markdown }],
    };
  },
};
