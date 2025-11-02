const logoImage = "/aion-logo.png";

interface AionLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export function AionLogo({ size = "md", showText = true, className = "" }: AionLogoProps) {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
    xl: "w-28 h-28",
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
