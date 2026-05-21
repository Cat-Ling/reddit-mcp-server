/* eslint-disable radix */

/**
 * HTML Scraping Logic for old.reddit.com
 */
import * as cheerio from 'cheerio';
import { buildHeaders } from '../utils/headers.js';

export async function scrapeRedditHtml(path, queryParams = {}) {
  const baseUrl = 'https://old.reddit.com';
  let cleanPath = path.endsWith('.json') ? path.slice(0, -5) : path;
  if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;

  const url = `${baseUrl}${cleanPath}?${new URLSearchParams(queryParams)}`;
  const res = await fetch(url, { headers: buildHeaders(false) });

  if (!res.ok) throw new Error(`Scrape failed: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());

  if (cleanPath.includes('/comments/')) return parsePostAndComments($, cleanPath);
  if (cleanPath.includes('/user/')) return parseUserProfile($, cleanPath);
  if (cleanPath.endsWith('/about')) return parseSubredditAbout($);
  if (cleanPath.endsWith('/rules')) return parseSubredditRules($);

  return parseListing($);
}

function parseListing($) {
  const children = [];
  $('.thing.link').each((i, el) => {
    const $el = $(el);
    const data = $el.data();
    if (!data) return;

    children.push({
      kind: 't3',
      data: {
        id: data.fullname?.split('_')[1],
        name: data.fullname,
        title: $el.find('a.title').text(),
        author: data.author,
        subreddit: data.subreddit,
        score: data.score,
        num_comments: parseInt($el.find('a.comments').text()) || 0,
        created_utc: data.timestamp / 1000,
        url: $el.find('a.title').attr('href'),
        permalink: data.permalink,
        selftext: $el.find('.usertext-body').text().trim(),
        is_gallery: $el.hasClass('is-gallery') || !!$el.find('.thumbnail.gallery').length,
        is_video: $el.hasClass('is-video') || !!$el.find('.video-indicator').length,
      },
    });
  });

  return {
    kind: 'Listing',
    data: {
      children,
      after: $('.next-button a').attr('href')?.split('after=')[1]?.split('&')[0] || null,
    },
  };
}

function parsePostAndComments($, permalink) {
  const postEl = $('.thing.link').first();
  const postData = postEl.data();

  const post = {
    kind: 't3',
    data: {
      title: postEl.find('a.title').text(),
      author: postData.author,
      subreddit: postData.subreddit,
      score: postData.score,
      num_comments: parseInt($('.commentarea > .menuarea .count').text()) || 0,
      created_utc: postData.timestamp / 1000,
      url: postEl.find('a.title').attr('href'),
      permalink: postData.permalink || permalink,
      selftext: postEl.find('.usertext-body').first().text().trim(),
    },
  };

  const comments = {
    kind: 'Listing',
    data: {
      children: parseRecursiveComments($, $('.commentarea > .sitetable')),
    },
  };

  return [{ kind: 'Listing', data: { children: [post] } }, comments];
}

function parseRecursiveComments($, container) {
  const nodes = [];
  container.children('.comment').each((i, el) => {
    const $el = $(el);
    const entry = $el.find('> .entry');

    nodes.push({
      kind: 't1',
      data: {
        id: $el.data('fullname')?.split('_')[1],
        author: entry.find('.author').first().text(),
        body: entry.find('.usertext-body').first().text().trim(),
        score: parseInt(entry.find('.score.unvoted').first().text(), 10) || 0,
        created_utc: Date.now() / 1000,
        replies: {
          kind: 'Listing',
          data: {
            children: parseRecursiveComments($, $el.find('> .child > .sitetable')),
          },
        },
      },
    });
  });
  return nodes;
}

function parseSubredditAbout($) {
  const title = $('.side .redditname a').text();
  return {
    kind: 't5',
    data: {
      display_name: title,
      title,
      subscribers: parseInt($('.side .subscribers .number').text().replace(/,/g, ''), 10) || 0,
      description: $('.side .usertext-body').text().trim(),
      created_utc: Date.now() / 1000,
    },
  };
}

function parseSubredditRules($) {
  const rules = [];
  $('.rules-table .rule').each((i, el) => {
    const $el = $(el);
    rules.push({
      short_name: $el.find('.rule-header').text().trim(),
      description: $el.find('.rule-body').text().trim(),
    });
  });
  return { rules };
}

function parseUserProfile($, path) {
  return {
    kind: 't2',
    data: {
      name: path.split('/')[2],
      link_karma: parseInt($('.userkarma').text().replace(/,/g, ''), 10) || 0,
      created_utc: Date.now() / 1000,
    },
  };
}
