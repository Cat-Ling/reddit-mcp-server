/**
 * Formatting Utilities for Reddit Data
 */

export function formatTimestamp(epochSecs) {
  if (!epochSecs) return 'N/A';
  return new Date(epochSecs * 1000).toLocaleString();
}

/**
 * Unescapes weird HTML entities that Reddit leaves inside JSON strings.
 */
export function unescapeHtml(text) {
  if (!text) return '';
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x200B;': '', // Zero-width space commonly used by Reddit
    '&nbsp;': ' ',
  };
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&#x200B;|&nbsp;/g, (match) => entities[match]);
}

export function truncateText(text, maxLength = 1000) {
  if (!text) return '';
  const cleanText = unescapeHtml(text);
  if (cleanText.length <= maxLength) return cleanText;
  return `${cleanText.substring(0, maxLength)}\n\n*(content truncated for length)*`;
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
          imageUrl = unescapeHtml(imageUrl);

          // Convert compressed/resized previews to raw, uncompressed source images
          try {
            const parsedUrl = new URL(imageUrl);
            if (parsedUrl.hostname === 'preview.redd.it') {
              parsedUrl.hostname = 'i.redd.it';
              parsedUrl.search = ''; // Strip all GET params (?width=...&s=...)
              imageUrl = parsedUrl.toString();
            }
          } catch {
            // Ignore if URL parsing fails
          }

          mediaUrls.push({ type: 'gallery_image', url: imageUrl });
          md += `    - Image ${index + 1}: [Direct Link](${imageUrl})\n`;
        }
      });
      md += `\n`;
    } catch {
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
    } else {
      try {
        const hostname = new URL(mainUrl).hostname;
        if (hostname === 'redgifs.com' || hostname.endsWith('.redgifs.com')) {
          mediaUrls.push({ type: 'redgifs', url: mainUrl });
          md += `*   🔞 **Redgifs**: [Link](${mainUrl})\n\n`;
        }
      } catch {
        // invalid URL
      }
    }
  }

  return { markdown: md, mediaUrls };
}
