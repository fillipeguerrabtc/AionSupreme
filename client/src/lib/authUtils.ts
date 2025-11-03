// Auth utility functions - blueprint:javascript_log_in_with_replit

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function login(): void {
  window.location.href = "/api/login";
}

export async function logout(): Promise<void> {
  try {
    // CRITICAL: Call backend to destroy session first
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    
    if (!response.ok) {
      console.error("Logout failed:", response.statusText);
    }
  } catch (error) {
    console.error("Logout error:", error);
  } finally {
    // Always redirect to login page after logout attempt
    window.location.href = "/login";
  }
}
