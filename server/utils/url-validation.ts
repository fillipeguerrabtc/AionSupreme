/**
 * URL Validation & Normalization Utility
 * 
 * ENTERPRISE STANDARD: Dual-layer validation prevents worker churn
 * - API layer: Normalize + auto-prepend protocol (user-friendly)
 * - Worker layer: Defensive validation (fail-fast)
 */

export interface URLValidationResult {
  valid: boolean;
  normalized?: string;
  warning?: string;
  error?: string;
}

/**
 * Validates and normalizes URL with smart protocol handling
 * 
 * FEATURES:
 * - Auto-prepends https:// if missing (99% of modern sites)
 * - Trims whitespace
 * - Lowercases hostname (RFC 3986)
 * - WHATWG URL parsing for validation
 * 
 * @param input Raw URL from user input
 * @returns Validation result with normalized URL
 */
export function validateAndNormalizeUrl(input: string): URLValidationResult {
  // 1. Sanitize input
  const trimmed = input.trim();
  
  if (!trimmed) {
    return {
      valid: false,
      error: "URL cannot be empty"
    };
  }
  
  // 2. Check if protocol is missing
  const hasProtocol = /^https?:\/\//i.test(trimmed);
  
  let urlToValidate = trimmed;
  let warning: string | undefined;
  
  if (!hasProtocol) {
    // Auto-prepend https:// (modern standard)
    urlToValidate = `https://${trimmed}`;
    warning = "Protocol auto-added: https://";
  }
  
  // 3. Validate using WHATWG URL parser
  try {
    const parsed = new URL(urlToValidate);
    
    // 4. Protocol validation - ONLY http/https allowed
    if (!parsed.protocol.match(/^https?:$/)) {
      return {
        valid: false,
        error: `Invalid URL: Protocol must be http or https, got ${parsed.protocol}`
      };
    }
    
    // 5. Hostname validation
    if (!parsed.hostname) {
      return {
        valid: false,
        error: "Invalid URL: Missing hostname"
      };
    }
    
    // Check for obvious malformed hosts
    if (parsed.hostname.includes(' ') || parsed.hostname.includes('..')) {
      return {
        valid: false,
        error: "Invalid URL: Malformed hostname"
      };
    }
    
    // 6. Normalize hostname to lowercase (RFC 3986)
    const normalized = new URL(urlToValidate);
    normalized.hostname = normalized.hostname.toLowerCase();
    
    return {
      valid: true,
      normalized: normalized.href,
      warning
    };
    
  } catch (error: any) {
    return {
      valid: false,
      error: `Invalid URL: ${error.message}`
    };
  }
}

/**
 * Strict validation without normalization (for defensive checks)
 * Used in DeepCrawler to catch legacy/invalid data
 */
export function strictValidateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    if (!parsed.hostname) {
      return { valid: false, error: "Missing hostname" };
    }
    
    if (!parsed.protocol.match(/^https?:$/)) {
      return { valid: false, error: "Protocol must be http or https" };
    }
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
