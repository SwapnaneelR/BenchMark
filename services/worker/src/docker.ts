import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { createReadStream, readdirSync, statSync, existsSync } from 'fs';
import { hostname } from 'os';
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

// ── Per-run ephemeral network ─────────────────────────────────────────────────

/**
 * Returns worker container's own ID so we can connect/disconnect it from
 * ephemeral networks. Docker sets hostname = short container ID (12 hex chars).
 */
function workerSelfId(): string {
  return hostname();
}

/**
 * Create an --internal bridge network for one benchmark run.
 * --internal: no default route to internet; engine container cannot phone home
 * and cannot reach other containers outside the network.
 */
export async function createBenchNetwork(runId: string): Promise<string> {
  const name = `bench-${runId}`;
  await execWithLogs(
    `docker network create --driver bridge --internal --label bench=true ${name}`,
  );
  console.log(`[docker] Created isolated network ${name}`);
  return name;
}

/** Attach the worker container itself so its subprocess fleet binary can reach the engine. */
export async function connectWorkerToNetwork(network: string): Promise<void> {
  const id = workerSelfId();
  await execWithLogs(`docker network connect ${network} ${id}`);
}

export async function disconnectWorkerFromNetwork(network: string): Promise<void> {
  const id = workerSelfId();
  await execAsync(`docker network disconnect ${network} ${id}`).catch(() => {});
}

export async function removeBenchNetwork(name: string): Promise<void> {
  await execAsync(`docker network rm ${name}`).catch(() => {});
}

// ── Container lifecycle ───────────────────────────────────────────────────────

/**
 * Run a submission container hardened for untrusted code.
 *
 * Isolation layers applied here:
 *   --cap-drop=ALL               no Linux capabilities
 *   --security-opt no-new-privileges  blocks setuid/setcap escalation
 *   --security-opt seccomp=...   syscall allowlist (if SECCOMP_PROFILE env set)
 *   --read-only                  immutable rootfs; can't write malware to disk
 *   --tmpfs /tmp                 writable scratch only in tmpfs; noexec+nosuid
 *   --network bridge             engine connects via daemon-side bridge network and published port
 *   --cpus / --memory / --pids   resource quotas
 *   --runtime=runsc (optional)   gVisor kernel sandbox (set DOCKER_RUNTIME=runsc)
 *
 * SECCOMP_PROFILE: host path to infra/seccomp/bench-engine.json.
 *   Must be on the Docker host filesystem, not inside the worker container.
 *   Setup: cp infra/seccomp/bench-engine.json /etc/docker/seccomp/bench-engine.json
 *   Then set SECCOMP_PROFILE=/etc/docker/seccomp/bench-engine.json in worker env.
 *
 * DOCKER_RUNTIME: set to "runsc" after installing gVisor on the host.
 *   Setup: https://gvisor.dev/docs/user_guide/install/
 *   Then: dockerd --add-runtime runsc=/usr/bin/runsc (or via daemon.json)
 */
export async function runContainer(
  tag: string,
  containerName: string,
): Promise<{ id: string; hostPort: number }> {
  const runtime = process.env.DOCKER_RUNTIME;
  const seccompProfile = process.env.SECCOMP_PROFILE;

  const runtimeArg     = runtime       ? `--runtime=${runtime}` : '';
  const seccompArg     = seccompProfile ? `--security-opt seccomp=${seccompProfile}` : '';

  const { stdout: idOut } = await execWithLogs(
    `docker run -d \
      --name ${containerName} \
      ${runtimeArg} \
      --cpus=1 --memory=512m --pids-limit=512 \
      --cap-drop=ALL \
      --security-opt no-new-privileges \
      ${seccompArg} \
      --read-only \
      --tmpfs /tmp:noexec,nosuid,size=64m \
      --network bridge \
      --publish 0:9000/tcp \
      ${tag}`,
  );
  const id = idOut.trim();
  const { stdout: portOut } = await execWithLogs(`docker port ${id} 9000/tcp`);
  const match = portOut.trim().match(/.*:(\d+)$/);
  if (!match) {
    throw new Error(`Unable to determine published port for container ${id}`);
  }
  return { id, hostPort: Number(match[1]) };
}

export async function removeContainer(id: string): Promise<void> {
  await execAsync(`docker rm -f ${id}`).catch(() => {});
}

export async function removeImage(tag: string): Promise<void> {
  await execAsync(`docker rmi ${tag}`).catch(() => {});
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
