import { exec } from 'child_process';
import { promisify } from 'util';
import type { LaunchOptions } from 'puppeteer';

const execAsync = promisify(exec);

let cachedChromiumPath: string | undefined;

export async function getSystemChromiumPath(): Promise<string> {
  if (cachedChromiumPath) {
    return cachedChromiumPath;
  }

  // PRIORITY 1: Respect environment variable overrides (custom deployments, CI/CD)
  const envOverrides = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.CHROMIUM_PATH,
  ];
  
  for (const envPath of envOverrides) {
    if (envPath) {
      cachedChromiumPath = envPath;
      console.log(`[Puppeteer] Using Chrome from ENV override: ${envPath}`);
      return cachedChromiumPath;
    }
  }

  // PRIORITY 2: Fallback search for common Chrome binaries
  const chromeBinaries = [
    'chromium',              // Replit, most Linux
    'google-chrome-stable',  // Production containers (Docker/K8s)
    'google-chrome',         // Alternative name
    'chromium-browser',      // Debian/Ubuntu
  ];

  for (const binary of chromeBinaries) {
    try {
      const { stdout } = await execAsync(`which ${binary}`);
      const path = stdout.trim();
      
      if (path) {
        cachedChromiumPath = path;
        console.log(`[Puppeteer] Using Chrome binary: ${binary} (${path})`);
        return cachedChromiumPath;
      }
    } catch {
      // Try next binary
      continue;
    }
  }
  
  throw new Error(`Chrome not found. Tried ENV vars: ${envOverrides.filter(Boolean).join(', ') || 'none'}, binaries: ${chromeBinaries.join(', ')}`);
}

export async function getPuppeteerConfig(
  overrides?: Partial<LaunchOptions>
): Promise<LaunchOptions> {
  const chromiumPath = await getSystemChromiumPath();
  
  return {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    executablePath: chromiumPath,
    ...overrides,
  };
}
