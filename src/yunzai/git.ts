/**
 * Git 抽象层
 *
 * 优先使用本地 git 命令行，如果系统未安装 git 则回退到 isomorphic-git。
 */
import { logger } from 'alemonjs';
import type { ChildProcess } from 'node:child_process';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';

// ─── 本地 git 检测（结果缓存） ───

let _hasNativeGit: boolean | null = null;

export function hasNativeGit(): boolean {
  if (_hasNativeGit !== null) {
    return _hasNativeGit;
  }
  try {
    execFileSync('git', ['--version'], { timeout: 5000, stdio: 'ignore' });
    _hasNativeGit = true;
    logger.info('[Git] 检测到本地 git');
  } catch {
    _hasNativeGit = false;
    logger.info('[Git] 未检测到本地 git，将使用 isomorphic-git');
  }

  return _hasNativeGit;
}

// ─── Git 操作结果 ───

export interface GitResult {
  /** 操作 Promise */
  promise: Promise<string>;
  /** 原生 git 子进程（isomorphic-git 模式为 null） */
  process: ChildProcess | null;
}

// ─── 原生 git 执行 ───

function nativeExec(args: string[], cwd?: string): GitResult {
  let cp!: ChildProcess;
  const promise = new Promise<string>((resolve, reject) => {
    cp = execFile('git', args, { cwd, timeout: 1_800_000 }, (err, stdout, stderr) => {
      if (err) {
        const hint = (err as any).killed ? ' (超时)' : '';
        const detail = stderr?.trim() ? `${stderr.trim()}\n${err.message}` : err.message;

        reject(new Error(`${detail}${hint}`));
      } else {
        resolve(stdout);
      }
    });
  });

  return { promise, process: cp };
}

// ─── isomorphic-git 延迟加载 ───

let _isoGit: typeof import('isomorphic-git') | null = null;
let _isoHttp: import('isomorphic-git').HttpClient | null = null;

async function iso() {
  if (!_isoGit) {
    _isoGit = await import('isomorphic-git');
    const httpMod = await import('isomorphic-git/http/node');

    _isoHttp = (httpMod as any).default ?? httpMod;
  }

  return { git: _isoGit, http: _isoHttp! };
}

// ─── 公开 API ───

/** git clone --depth 1 --single-branch <url> <dir> */
export function gitClone(url: string, dir: string): GitResult {
  if (hasNativeGit()) {
    return nativeExec(['clone', '--depth', '1', '--single-branch', url, dir]);
  }

  return {
    process: null,
    promise: (async () => {
      const { git, http } = await iso();

      await git.clone({ fs, http, dir, url, depth: 1, singleBranch: true });

      return 'clone complete';
    })()
  };
}

/** git fetch --all */
export function gitFetchAll(dir: string): GitResult {
  if (hasNativeGit()) {
    return nativeExec(['fetch', '--all'], dir);
  }

  return {
    process: null,
    promise: (async () => {
      const { git, http } = await iso();

      await git.fetch({ fs, http, dir });

      return 'fetch complete';
    })()
  };
}

/** git reset --hard origin/HEAD */
export function gitResetHard(dir: string): GitResult {
  if (hasNativeGit()) {
    return nativeExec(['reset', '--hard', 'origin/HEAD'], dir);
  }

  return {
    process: null,
    promise: (async () => {
      const { git } = await iso();
      const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? 'master';
      let remoteSha: string;

      try {
        remoteSha = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` });
      } catch {
        remoteSha = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/HEAD' });
      }
      // 直接更新本地分支 ref 指向远程提交
      const refsDir = join(dir, '.git', 'refs', 'heads');

      if (!fs.existsSync(refsDir)) {
        fs.mkdirSync(refsDir, { recursive: true });
      }
      fs.writeFileSync(join(refsDir, branch), remoteSha + '\n');
      // 强制检出工作区
      await git.checkout({ fs, dir, ref: branch, force: true });

      return 'reset complete';
    })()
  };
}

/** git pull */
export function gitPull(dir: string): GitResult {
  if (hasNativeGit()) {
    return nativeExec(['pull'], dir);
  }

  return {
    process: null,
    promise: (async () => {
      const { git, http } = await iso();

      await git.pull({
        fs,
        http,
        dir,
        singleBranch: true,
        author: { name: 'alemonjs', email: 'alemonjs@local' }
      });

      return 'pull complete';
    })()
  };
}
