// Auth utility functions - blueprint:javascript_log_in_with_replit

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function login(): void {
  window.location.href = "/api/login";
}

/**
 * Logout for chat interface - returns to chat page (not login)
 */
export async function logoutChat(): Promise<void> {
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
    // Chat logout returns to chat page (user sees chat as anonymous)
    window.location.href = "/";
  }
}

/**
 * Logout for admin dashboard - returns to admin login page
 */
export async function logoutAdmin(): Promise<void> {
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
    // Admin logout redirects to admin login page
    window.location.href = "/login";
  }
}

/**
 * @deprecated Use logoutChat() or logoutAdmin() instead
 * Legacy logout function - kept for backward compatibility
 */
export async function logout(): Promise<void> {
  await logoutAdmin();
}
