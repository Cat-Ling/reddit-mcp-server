/**
 * Formatting Utilities for Reddit Data
 */

export function formatTimestamp(epochSecs) {
  if (!epochSecs) return 'N/A';
  return new Date(epochSecs * 1000).toLocaleString();
}

export function truncateText(text, maxLength = 1000) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}\n\n*(content truncated for length)*`;
}

/**
 * Extracts and formats media content into Markdown.
 */
export function formatPostMediaMarkdown(p) {
  let md = '';
  const mediaUrls = [];

  // 1. Reddit Video
  if (p.media?.reddit_video) {
    const videoUrl = p.media.reddit_video.fallback_url;
    mediaUrls.push({ type: 'reddit_video', url: videoUrl });
    md += `*   🎥 **Reddit Video**: [Fallback Stream Link](${videoUrl})\n`;
    md += `    > [!TIP]\n`;
    md += `    > Use \`yt-dlp-mcp\` to download this content.\n\n`;
  }

  // 2. Reddit Gallery
  if (p.is_gallery && p.media_metadata) {
    md += `*   🖼️ **Reddit Image Gallery**:\n`;
    try {
      Object.values(p.media_metadata).forEach((item, index) => {
        let imageUrl = item.s?.u || item.s?.gif;
        if (imageUrl) {
          imageUrl = imageUrl.replace(/&amp;/g, '&');
          mediaUrls.push({ type: 'gallery_image', url: imageUrl });
          md += `    - Image ${index + 1}: [Direct Link](${imageUrl})\n`;
        }
      });
      md += `\n`;
    } catch (e) {
      md += `    *(Failed to parse gallery metadata)*\n\n`;
    }
  }

  // 3. External Media
  const mainUrl = p.url || '';
  const isDirectImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(mainUrl);

  if (mainUrl && !p.is_gallery) {
    if (isDirectImage) {
      mediaUrls.push({ type: 'direct_image', url: mainUrl });
      md += `*   🖼️ **Image URL**: [Direct Link](${mainUrl})\n\n`;
    } else if (mainUrl.includes('redgifs.com')) {
      mediaUrls.push({ type: 'redgifs', url: mainUrl });
      md += `*   🔞 **Redgifs**: [Link](${mainUrl})\n\n`;
    }
  }

  return { markdown: md, mediaUrls };
}
