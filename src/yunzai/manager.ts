/**
 * Yunzai 进程管理器
 *
 * 职责：
 * 1. Git 操作 — clone / pull Miao-Yunzai 仓库
 * 2. 子进程生命周期 — fork / stop / restart Worker
 * 3. IPC 通信 — 父子进程消息收发
 */
import { logger } from 'alemonjs';
import type { ChildProcess } from 'node:child_process';
import { execFile, fork } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getDefaultRepo, getMiaoPluginRepo, getYunzaiDir, WORKER_PATH, YARN_PATH } from '../path';
import type { IPCReply, ParentToWorker, WorkerToParent } from './protocol';

type ReplyHandler = (reply: IPCReply) => void;

class YunzaiManager {
  private worker: ChildProcess | null = null;
  private ready = false;
  private replyHandlers = new Set<ReplyHandler>();
  private restartCount = 0;
  private maxRestarts = 3;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── 状态查询 ───

  get isInstalled(): boolean {
    return existsSync(getYunzaiDir());
  }

  get isRunning(): boolean {
    return this.worker !== null && !this.worker.killed;
  }

  get isReady(): boolean {
    return this.ready;
  }

  getStatus(): string {
    if (!this.isInstalled) return '未安装';
    if (!this.isRunning) return '已停止';
    if (!this.ready) return '启动中';
    return '运行中';
  }

  // ─── Git 操作 ───

  async install(repoUrl = getDefaultRepo()): Promise<void> {
    const yunzaiDir = getYunzaiDir();
    if (this.isInstalled) {
      throw new Error(`Yunzai 已安装在 ${yunzaiDir}`);
    }

    logger.info(`[Yunzai] 正在克隆 ${repoUrl} ...`);
    await this.git(['clone', '--depth', '1', repoUrl, yunzaiDir]);
    this.ensureWorkspaces();
    await this.ensureMiaoPlugin();
    logger.info('[Yunzai] 克隆完成，正在安装依赖...');
    await this.npmInstall(yunzaiDir);
    logger.info('[Yunzai] 依赖安装完成');
  }

  async update(): Promise<string> {
    if (!this.isInstalled) throw new Error('Yunzai 未安装');
    logger.info('[Yunzai] 正在拉取更新...');
    const out = await this.git(['pull'], getYunzaiDir());
    logger.info('[Yunzai] 更新完成');
    return out;
  }

  // ─── 进程控制 ───

  async start(): Promise<void> {
    if (this.isRunning) throw new Error('Worker 已在运行');
    if (!this.isInstalled) {
      logger.warn('[Yunzai] 未安装，跳过启动。发送 #yunzai安装 进行安装');
      return;
    }

    // 启动前检查 miao-plugin
    await this.ensureMiaoPlugin();

    this.ready = false;

    this.worker = fork(WORKER_PATH, [], {
      cwd: getYunzaiDir(),
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, YUNZAI_DIR: getYunzaiDir() }
    });

    // 转发子进程标准输出
    this.worker.stdout?.on('data', (buf: Buffer) => {
      for (const line of buf.toString().split('\n').filter(Boolean)) {
        logger.info(`[Yunzai:out] ${line}`);
      }
    });
    this.worker.stderr?.on('data', (buf: Buffer) => {
      for (const line of buf.toString().split('\n').filter(Boolean)) {
        logger.warn(`[Yunzai:err] ${line}`);
      }
    });

    // IPC 消息路由
    this.worker.on('message', (msg: WorkerToParent) => {
      this.handleMessage(msg);
    });

    // 退出监听 & 自动重启
    this.worker.on('exit', (code, signal) => {
      logger.info(`[Yunzai] Worker 退出 code=${code} signal=${signal}`);
      this.worker = null;
      this.ready = false;

      if (code !== 0 && this.restartCount < this.maxRestarts) {
        this.restartCount++;
        logger.info(`[Yunzai] 自动重启 (${this.restartCount}/${this.maxRestarts})...`);
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          this.start();
        }, 3000);
      }
    });

    // 阻塞等待 ready 信号
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.worker!.removeListener('message', handler);
        reject(new Error('Worker 启动超时 (30s)'));
      }, 30_000);

      const handler = (msg: WorkerToParent) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.worker!.removeListener('message', handler);
          this.ready = true;
          this.restartCount = 0;
          logger.info(`[Yunzai] Worker 就绪，已加载 ${msg.pluginCount} 个插件`);
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          this.worker!.removeListener('message', handler);
          reject(new Error(msg.message));
        }
      };
      this.worker!.on('message', handler);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.worker) return;

    this.ready = false;
    this.restartCount = this.maxRestarts; // 阻止自动重启

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.send({ type: 'shutdown' });

    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        this.worker?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.worker!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.worker = null;
  }

  async restart(): Promise<void> {
    this.restartCount = 0;
    await this.stop();
    await this.start();
  }

  // ─── IPC 通信 ───

  send(msg: ParentToWorker): void {
    if (!this.worker || !this.isRunning) return;
    this.worker.send(msg);
  }

  /** 注册回复处理器，返回取消函数 */
  onReply(handler: ReplyHandler): () => void {
    this.replyHandlers.add(handler);
    return () => this.replyHandlers.delete(handler);
  }

  // ─── 内部方法 ───

  private handleMessage(msg: WorkerToParent): void {
    switch (msg.type) {
      case 'reply':
        for (const h of this.replyHandlers) h(msg);
        break;
      case 'error':
        logger.error(`[Yunzai:worker] ${msg.message}`);
        break;
      case 'log': {
        const fn = (logger as any)[msg.level];
        if (typeof fn === 'function') {
          fn.call(logger, `[Yunzai] ${msg.args.join(' ')}`);
        }
        break;
      }
      // 'ready' 在 start() 的 Promise handler 中处理
    }
  }

  private git(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
  }

  /** 使用内置 yarn 安装依赖（原生支持 workspaces，插件子包依赖一并安装） */
  private npmInstall(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(process.execPath, [YARN_PATH, 'install', '--production=false'], { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
  }

  /** 重新安装依赖（用于依赖缺失后修复） */
  async installDeps(): Promise<string> {
    if (!this.isInstalled) throw new Error('Yunzai 未安装');
    this.ensureWorkspaces();
    await this.ensureMiaoPlugin();
    logger.info('[Yunzai] 正在安装依赖...');
    const out = await this.npmInstall(getYunzaiDir());
    logger.info('[Yunzai] 依赖安装完成');
    return out;
  }

  /**
   * 确保 package.json 包含 private 和 workspaces 字段
   * Yarn 1.x 要求 private: true 才能启用 workspaces
   */
  private ensureWorkspaces(): void {
    const pkgPath = `${getYunzaiDir()}/package.json`;
    if (!existsSync(pkgPath)) return;

    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    let modified = false;

    if (!pkg.private) {
      pkg.private = true;
      modified = true;
      logger.info('[Yunzai] package.json 补充 private: true');
    }

    if (!Array.isArray(pkg.workspaces) || !pkg.workspaces.includes('plugins/*')) {
      pkg.workspaces = ['plugins/*'];
      modified = true;
      logger.info('[Yunzai] package.json 补充 workspaces: ["plugins/*"]');
    }

    if (modified) {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    }
  }

  /** 检查并安装 miao-plugin（必装插件） */
  private async ensureMiaoPlugin(): Promise<void> {
    const pluginDir = `${getYunzaiDir()}/plugins/miao-plugin`;
    if (existsSync(pluginDir)) return;

    logger.info('[Yunzai] miao-plugin 未安装，正在克隆...');
    await this.git(['clone', '--depth', '1', getMiaoPluginRepo(), pluginDir]);
    logger.info('[Yunzai] miao-plugin 安装完成');
  }
}

export const manager = new YunzaiManager();
