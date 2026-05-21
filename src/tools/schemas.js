import { z } from 'zod';

export const FrontpageSchema = z.object({
  feed: z.enum(['popular', 'all', 'home']).default('popular'),
  sort: z.enum(['hot', 'new', 'top', 'rising']).default('hot'),
  time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
  limit: z.number().int().min(1).max(100).default(25),
  after: z.string().optional().default(''),
});

export const SubredditPostsSchema = z.object({
  subreddit: z.string().min(1),
  sort: z.enum(['hot', 'new', 'top', 'rising']).default('hot'),
  time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
  limit: z.number().int().min(1).max(100).default(25),
  after: z.string().optional().default(''),
});

export const PostDetailsSchema = z.object({
  permalink: z.string().min(1),
  depth: z.number().int().min(1).max(10).default(3),
  limit: z.number().int().min(1).max(200).default(50),
});

export const SearchSchema = z.object({
  query: z.string().min(1),
  subreddit: z.string().optional(),
  sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).default('relevance'),
  time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('all'),
  limit: z.number().int().min(1).max(100).default(25),
  after: z.string().optional().default(''),
});

export const SubredditAboutSchema = z.object({
  subreddit: z.string().min(1),
});

export const UserProfileSchema = z.object({
  username: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
});
