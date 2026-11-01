import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Shared HTTP transport helpers. Node's fetch is the default path; curl is
// the fallback for Anthropic's edge rejecting Node's TLS ClientHello
// fingerprint (quota API). curl.exe ships with Windows 10+ and is universally
// available on macOS / Linux.

export interface HttpResponse {
  status: number;
  body: string;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

/** Run an HTTP request via Node fetch. Optional timeoutMs aborts the request
 * and surfaces a clear "timed out" error instead of hanging forever. */
export async function requestViaFetch(
  url: string,
  opts: HttpRequestOptions & { timeoutMs?: number; redirect?: 'error' | 'follow' | 'manual' }
): Promise<HttpResponse> {
  if (typeof fetch === 'undefined') {
    throw new Error('fetch unavailable in this VS Code version');
  }
  let signal: AbortSignal | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = (): void => controller?.abort();
  if ((opts.timeoutMs && opts.timeoutMs > 0) || opts.signal) {
    controller = new AbortController();
    if (opts.signal?.aborted) controller.abort();
    else opts.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  if (opts.timeoutMs && opts.timeoutMs > 0 && controller) {
    timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  }
  signal = controller?.signal ?? opts.signal;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: typeof opts.body === 'string' || opts.body === undefined
        ? opts.body
        : Buffer.from(opts.body),
      ...(opts.redirect ? { redirect: opts.redirect } : {}),
      signal
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      if (opts.signal?.aborted) throw new Error('Request cancelled');
      throw new Error(`Request timed out after ${Math.round((opts.timeoutMs || 0) / 1000)}s`);
    }
    throw e;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    opts.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function curlConfigValue(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error('curl header names and values must not contain line breaks');
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Run an HTTP request via the system curl binary. Headers and the body file
 * reference travel in a stdin config so no secret appears on the command line. */
export async function requestViaCurl(
  url: string,
  opts: HttpRequestOptions & { timeoutSec?: number },
  log?: (line: string) => void
): Promise<HttpResponse> {
  if (opts.signal?.aborted) {
    throw new Error('Request cancelled');
  }
  const config = Object.entries(opts.headers || {}).map(
    ([k, v]) => `header = ${curlConfigValue(`${k}: ${v}`)}`
  );
  let bodyDir: string | undefined;
  try {
    if (opts.body !== undefined) {
      bodyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ccu-curl-'));
      const bodyFile = path.join(bodyDir, 'body');
      await fs.promises.writeFile(bodyFile, opts.body, { mode: 0o600, flag: 'wx' });
      config.push(`data-binary = ${curlConfigValue(`@${bodyFile}`)}`);
    }
    return await runCurl(url, opts, `${config.join('\n')}\n`, log);
  } finally {
    if (bodyDir) {
      await fs.promises.rm(bodyDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function runCurl(
  url: string,
  opts: HttpRequestOptions & { timeoutSec?: number },
  config: string,
  log?: (line: string) => void
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const timeoutSec = opts.timeoutSec ?? 15;
    // -q must stay the first argument, otherwise curl reads ~/.curlrc first.
    const args: string[] = [
      '-q', '-K', '-', '-sS', '--max-redirs', '0',
      '-w', '\n__CCU_STATUS__%{http_code}', '--max-time', String(timeoutSec),
    ];
    if (opts.method && opts.method !== 'GET') {
      args.push('-X', opts.method);
    }
    args.push(url);

    // On Windows be explicit about the .exe extension so spawn doesn't
    // depend on PATHEXT resolution; on POSIX 'curl' is correct.
    const cmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    // Pin cwd to the home dir. The extension host inherits its cwd from VS Code,
    // and after switching folders in the SAME window that inherited cwd can point
    // at a directory that no longer exists — spawn then fails with ENOENT and the
    // quota silently stops loading (while a fresh window, with a valid cwd, works
    // fine). curl needs no particular cwd, so anchor it somewhere always valid.
    const child = spawn(cmd, args, { shell: false, windowsHide: true, cwd: os.homedir() });
    let settled = false;
    let stopReason: Error | undefined;
    const stop = (reason: Error): void => {
      stopReason ??= reason;
      child.kill();
    };
    const abort = (): void => stop(new Error('Request cancelled'));
    const timer = setTimeout(
      () => stop(new Error(`Request timed out after ${timeoutSec}s`)),
      timeoutSec * 1000 + 1000
    );
    const finish = (error: Error | undefined, response?: HttpResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(response!);
    };
    opts.signal?.addEventListener('abort', abort, { once: true });
    if (opts.signal?.aborted) abort();
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.stdin.on('error', () => undefined);
    child.on('error', (e) => {
      if (log) {
        log(`curl: spawn error ${(e as Error).message} (is curl on PATH?)`);
      }
      finish(e);
    });
    child.on('close', (code) => {
      if (stopReason) {
        return finish(stopReason);
      }
      if (code !== 0) {
        return finish(new Error(`curl exit ${code}: ${stderr.trim().slice(0, 200)}`));
      }
      const m = stdout.match(/^([\s\S]*)\n__CCU_STATUS__(\d{3})$/);
      if (!m) {
        return finish(new Error(`Could not parse curl output: ${stdout.slice(0, 200)}`));
      }
      finish(undefined, { status: parseInt(m[2], 10), body: m[1] });
    });
    child.stdin.end(config);
  });
}
