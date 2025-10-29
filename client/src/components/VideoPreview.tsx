interface VideoPreviewProps {
  url: string;
}

export function VideoPreview({ url }: VideoPreviewProps) {
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

  // Direct video file
  if (videoInfo.platform === "Direct") {
    return (
      <div className="my-4 rounded-lg overflow-hidden border border-border glass" data-testid="video-preview-direct">
        <video
          controls
          className="w-full max-h-96"
          src={videoInfo.embedUrl}
          data-testid="video-player-direct"
        >
          Seu navegador não suporta reprodução de vídeo.
        </video>
      </div>
    );
  }

  // Embedded iframe for YouTube/Vimeo/Dailymotion
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border glass" data-testid={`video-preview-${videoInfo.platform.toLowerCase()}`}>
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
    </div>
  );
}
