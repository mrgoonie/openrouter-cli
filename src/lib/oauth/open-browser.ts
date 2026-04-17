/**
 * Cross-platform browser opener.
 * Attempts to open a URL in the default browser using the platform's native command.
 * Always returns a boolean — errors are swallowed so the caller can continue
 * after printing the URL to stderr independently.
 */

/**
 * Open `url` in the system default browser.
 * Returns `true` when the spawn succeeded, `false` on any failure.
 */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    const platform = process.platform;

    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (platform === 'win32') {
      cmd = 'cmd.exe';
      args = ['/c', 'start', '', url];
    } else {
      // linux, freebsd, etc.
      cmd = 'xdg-open';
      args = [url];
    }

    const proc = Bun.spawn([cmd, ...args], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    });

    // Wait for the spawned process to confirm it started
    await proc.exited;
    return true;
  } catch {
    return false;
  }
}
