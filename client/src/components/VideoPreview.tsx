import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import type { HTMLAttributes } from "react";

interface VideoPreviewProps extends HTMLAttributes<HTMLDivElement> {
  url: string;
}

export function VideoPreview({ url, ...props }: VideoPreviewProps) {
  // Extract video ID and platform
  const getEmbedUrl = (videoUrl: string): { embedUrl: string; platform: string } | null => {
    // YouTube patterns
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/;
    const youtubeMatch = videoUrl.match(youtubeRegex);
    if (youtubeMatch) {
      return {
        embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
        platform: "YouTube"
      };
    }

    // Vimeo patterns
    const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;
    const vimeoMatch = videoUrl.match(vimeoRegex);
    if (vimeoMatch) {
      return {
        embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        platform: "Vimeo"
      };
    }

    // Dailymotion patterns
    const dailymotionRegex = /dailymotion\.com\/video\/([^_\?\/]+)/;
    const dailymotionMatch = videoUrl.match(dailymotionRegex);
    if (dailymotionMatch) {
      return {
        embedUrl: `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`,
        platform: "Dailymotion"
      };
    }

    // Twitch patterns (clips and VODs)
    const twitchClipRegex = /clips\.twitch\.tv\/([^\/\?]+)|twitch\.tv\/\w+\/clip\/([^\/\?]+)/;
    const twitchClipMatch = videoUrl.match(twitchClipRegex);
    if (twitchClipMatch) {
      const clipId = twitchClipMatch[1] || twitchClipMatch[2];
      return {
        embedUrl: `https://clips.twitch.tv/embed?clip=${clipId}&parent=${window.location.hostname}`,
        platform: "Twitch"
      };
    }

    // Streamable patterns
    const streamableRegex = /streamable\.com\/([^\/\?]+)/;
    const streamableMatch = videoUrl.match(streamableRegex);
    if (streamableMatch) {
      return {
        embedUrl: `https://streamable.com/e/${streamableMatch[1]}`,
        platform: "Streamable"
      };
    }

    // Direct video files
    if (/\.(mp4|webm|ogg|mov)$/i.test(videoUrl)) {
      return {
        embedUrl: videoUrl,
        platform: "Direct"
      };
    }

    return null;
  };

  const videoInfo = getEmbedUrl(url);

  if (!videoInfo) {
    return null;
  }

  const handleDownload = async () => {
    try {
      // Use proxy for direct video files to avoid CORS
      const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(videoInfo.embedUrl)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = videoInfo.embedUrl.split('/').pop() || 'video.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Falha ao baixar vídeo. Tente abrir em nova aba.');
    }
  };

  // Direct video file
  if (videoInfo.platform === "Direct") {
    return (
      <div className="my-4 rounded-lg overflow-hidden border border-border glass group relative" {...props}>
        <video
          controls
          className="w-full max-h-96"
          src={videoInfo.embedUrl}
          data-testid="video-player-direct"
        >
          Seu navegador não suporta reprodução de vídeo.
        </video>
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="default"
            className="h-8 w-8 shadow-lg"
            onClick={handleDownload}
            data-testid="button-download-video"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Embedded iframe for YouTube/Vimeo/Dailymotion
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border glass group relative" {...props}>
      <div className="aspect-video w-full">
        <iframe
          src={videoInfo.embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={`${videoInfo.platform} video player`}
          data-testid={`video-iframe-${videoInfo.platform.toLowerCase()}`}
        />
      </div>
      
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="default"
          className="h-8 w-8 shadow-lg"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          data-testid="button-open-video"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
