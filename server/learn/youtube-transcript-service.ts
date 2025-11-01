import { YoutubeTranscript } from 'youtube-transcript';

export interface YouTubeVideoInfo {
  videoId: string;
  url: string;
  title?: string;
  transcript: string;
  wordCount: number;
  duration?: number;
}

/**
 * Extract video ID from YouTube URL
 * Supports all common URL formats and query parameter positions
 */
function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Watch URL: youtube.com/watch?v=ID (handles v= anywhere in query)
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
      const videoId = urlObj.searchParams.get('v');
      if (videoId) return videoId;
    }
    
    // Short URL: youtu.be/ID
    if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1); // Remove leading /
      if (videoId) return videoId;
    }
    
    // Embed URL: youtube.com/embed/ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/embed/')) {
      const videoId = urlObj.pathname.split('/')[2];
      if (videoId) return videoId;
    }
    
    // Video URL: youtube.com/v/ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/v/')) {
      const videoId = urlObj.pathname.split('/')[2];
      if (videoId) return videoId;
    }
  } catch (error) {
    // Invalid URL format, return null
    return null;
  }

  return null;
}

/**
 * Fetch YouTube video transcript
 * Falls back to multiple languages if primary fails
 */
export async function fetchYouTubeTranscript(url: string): Promise<YouTubeVideoInfo> {
  const videoId = extractVideoId(url);
  
  if (!videoId) {
    throw new Error('Invalid YouTube URL - could not extract video ID');
  }

  console.log(`[YouTube] 📹 Fetching transcript for video: ${videoId}`);

  try {
    // Try to fetch transcript (auto-selects best language)
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'pt,en,es', // Priority: PT → EN → ES
    });

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript available for this video');
    }

    // Combine all transcript segments into full text
    const fullTranscript = transcriptItems
      .map((item: any) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    const wordCount = fullTranscript.split(/\s+/).length;
    
    // Duration: offset is already in seconds, round to nearest second
    const lastItem = transcriptItems[transcriptItems.length - 1];
    const durationSeconds = Math.floor(lastItem?.offset || 0);

    console.log(`[YouTube] ✅ Transcript fetched: ${wordCount} words, ${transcriptItems.length} segments, ${Math.floor(durationSeconds / 60)}min ${durationSeconds % 60}s`);

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      transcript: fullTranscript,
      wordCount,
      duration: durationSeconds,
    };

  } catch (error: any) {
    console.error(`[YouTube] ❌ Failed to fetch transcript:`, error.message);
    
    // Common errors
    if (error.message.includes('Could not find captions')) {
      throw new Error('This video does not have captions/subtitles available');
    }
    if (error.message.includes('Video unavailable')) {
      throw new Error('Video is unavailable or private');
    }
    
    throw error;
  }
}

/**
 * Check if URL is a YouTube video
 */
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)/i.test(url);
}

/**
 * Extract YouTube video title from metadata
 * Note: This would require additional API call or web scraping
 * For now, we'll rely on transcript content
 */
export async function getYouTubeVideoTitle(videoId: string): Promise<string | null> {
  // TODO: Implement using YouTube Data API or web scraping
  // For now, return null and rely on user-provided title
  return null;
}
