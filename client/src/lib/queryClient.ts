import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ValidationError extends Error {
  public details?: string[];
  public warnings?: string[];
  public statusCode: number;

  constructor(message: string, statusCode: number, details?: string[], warnings?: string[]) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = statusCode;
    this.details = details;
    this.warnings = warnings;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      try {
        const json = await res.json();
        const message = json.error || json.message || res.statusText;
        
        if (json.details || json.warnings) {
          throw new ValidationError(message, res.status, json.details, json.warnings);
        }
        
        throw new Error(`${res.status}: ${message}`);
      } catch (e) {
        if (e instanceof ValidationError) throw e;
        const text = await res.text();
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
    }
    
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Overloaded apiRequest to support both signatures
export async function apiRequest(url: string, options?: RequestInit): Promise<Response>;
export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response>;
export async function apiRequest(
  methodOrUrl: string,
  urlOrOptions?: string | RequestInit,
  data?: unknown,
): Promise<Response> {
  // If second param is an object (RequestInit), use simple signature: apiRequest(url, options)
  if (typeof urlOrOptions === "object" || urlOrOptions === undefined) {
    const url = methodOrUrl;
    const options = (urlOrOptions || {}) as RequestInit;
    
    const res = await fetch(url, {
      ...options,
      headers: {
        'X-Requested-With': 'XMLHttpRequest', // 🔒 CSRF protection
        ...options.headers,
      },
      credentials: "include",
    });
    
    await throwIfResNotOk(res);
    return res;
  }
  
  // Otherwise use old signature: apiRequest(method, url, data)
  const method = methodOrUrl;
  const url = urlOrOptions as string;
  
  const res = await fetch(url, {
    method,
    headers: {
      'X-Requested-With': 'XMLHttpRequest', // 🔒 CSRF protection
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest', // 🔒 CSRF protection
      },
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
