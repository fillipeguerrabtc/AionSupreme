import { exec } from 'child_process';
import { promisify } from 'util';
import type { LaunchOptions } from 'puppeteer';

const execAsync = promisify(exec);

let cachedChromiumPath: string | undefined;

export async function getSystemChromiumPath(): Promise<string> {
  if (cachedChromiumPath) {
    return cachedChromiumPath;
  }

  try {
    const { stdout } = await execAsync('which chromium');
    cachedChromiumPath = stdout.trim();
    
    if (!cachedChromiumPath) {
      throw new Error('Chromium not found in PATH');
    }
    
    console.log(`[Puppeteer] Using system Chromium: ${cachedChromiumPath}`);
    return cachedChromiumPath;
  } catch (error: any) {
    throw new Error(`Failed to locate system Chromium: ${error.message}`);
  }
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
