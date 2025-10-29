// Auth utility functions - blueprint:javascript_log_in_with_replit

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function login(): void {
  window.location.href = "/api/login";
}

export function logout(): void {
  window.location.href = "/api/logout";
}
