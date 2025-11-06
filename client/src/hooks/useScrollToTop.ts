import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Hook to automatically scroll to top when page/route loads
 * Usage: Add `useScrollToTop()` at the top of any page component
 */
export function useScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location]);
}
