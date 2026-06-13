import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { createReadStream, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import WebSocket from 'ws';
import unzipper from 'unzipper';

const execAsync = promisify(exec);

async function execWithLogs(cmd: string, opts?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(cmd, opts);
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (err: any) {
    console.error(`[docker] command failed:\n  cmd: ${cmd}\n  stdout: ${err.stdout ?? ''}\n  stderr: ${err.stderr ?? ''}`);
    throw err;
  }
}

/** Always use POSIX separators — worker runs on Linux even when dev host is Windows */
function posix(p: string) {
  return p.replace(/\\/g, '/');
}

export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await createReadStream(posix(zipPath))
    .pipe(unzipper.Extract({ path: posix(destDir) }))
    .promise();
}

/**
 * Find the directory that actually contains Dockerfile.
 * Handles the common case where users zip the folder (adding one extra nesting level).
 */
function findDockerfileDir(baseDir: string): string {
  const dir = posix(baseDir);
  if (existsSync(path.posix.join(dir, 'Dockerfile'))) return dir;

  // Single top-level subdirectory wrapping
  try {
    const entries = readdirSync(dir).filter(e => !e.startsWith('.'));
    if (entries.length >= 1) {
      for (const entry of entries) {
        const sub = path.posix.join(dir, entry);
        if (statSync(sub).isDirectory() && existsSync(path.posix.join(sub, 'Dockerfile'))) {
          console.log(`[docker] Dockerfile found in subdirectory: ${sub}`);
          return sub;
        }
      }
    }
  } catch { /* fallthrough */ }

  // Fallback: return base and let docker fail with a clear error
  console.error(`[docker] No Dockerfile found in ${dir} or its subdirectories`);
  return dir;
}

export async function buildImage(contextDir: string, tag: string): Promise<void> {
  const dir = findDockerfileDir(contextDir);
  console.log(`[docker] Building ${tag} from ${dir}`);
  // Pipe build context as tar to stdin — avoids DOOD path resolution issue where
  // Docker daemon can't access paths that only exist inside the worker container.
  const { stderr } = await execWithLogs(
    `tar -C "${dir}" --exclude='./node_modules' --exclude='./.git' -czf - . | docker build -t ${tag} -`,
    { timeout: 600_000 },
  );
  if (stderr) console.log('[docker build]', stderr);
}

export async function runContainer(tag: string): Promise<{ id: string; port: number }> {
  const { stdout: idOut } = await execWithLogs(
    `docker run -d --cpus=1 --memory=512m --pids-limit=512 --cap-drop=ALL -p 9000 ${tag}`,
  );
  const id = idOut.trim();

  await new Promise(r => setTimeout(r, 500));

  const { stdout: portOut } = await execWithLogs(`docker port ${id} 9000`);
  const portMatch = portOut.match(/:(\d+)/);
  if (!portMatch) throw new Error(`Could not parse port from: ${portOut}`);
  return { id, port: parseInt(portMatch[1]) };
}

export async function removeContainer(id: string): Promise<void> {
  await execAsync(`docker rm -f ${id}`).catch(() => {});
}

export async function waitForWs(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => { ws.terminate(); resolve(false); }, 1500);
      ws.once('open', () => { clearTimeout(t); ws.close(); resolve(true); });
      ws.once('error', () => { clearTimeout(t); resolve(false); });
    });
    if (ready) return;
    await new Promise(r => setTimeout(r, 600));
  }
  throw new Error(`Engine not ready at ${url} after ${timeoutMs}ms`);
}
