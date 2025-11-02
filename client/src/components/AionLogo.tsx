const logoImage = "/aion-logo.png";

interface AionLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function AionLogo({ size = "md", showText = true, className = "" }: AionLogoProps) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-3xl",
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src={logoImage} 
        alt="AION Logo" 
        className={sizeClasses[size]}
      />
      {showText && (
        <h1 className={`${textSizeClasses[size]} font-bold gradient-text`}>AION</h1>
      )}
    </div>
  );
}
