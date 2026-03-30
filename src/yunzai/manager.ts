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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { PluginInfo } from '../path';
import { getDefaultRepo, getGhProxy, getYunzaiDir, WORKER_PATH, YARN_PATH } from '../path';
import type { IPCReply, ParentToWorker, WorkerToParent } from './protocol';

type ReplyHandler = (reply: IPCReply) => void;

class YunzaiManager {
  private worker: ChildProcess | null = null;
  private ready = false;
  private replyHandlers = new Set<ReplyHandler>();
  private doneHandlers = new Set<(done: any) => void>();
  private restartCount = 0;
  private maxRestarts = 3;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  /** 当前正在执行的长时间任务名称 */
  private taskName: string | null = null;
  /** 当前长时间任务的子进程（用于取消） */
  private taskProcess: ChildProcess | null = null;
  /** 任务是否被用户取消 */
  private taskCancelled = false;

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
    if (this.taskName) {
      return `正在${this.taskName}`;
    }
    if (!this.isInstalled) {
      return '未安装';
    }
    if (!this.isRunning) {
      return '已停止';
    }
    if (!this.ready) {
      return '启动中';
    }

    return '运行中';
  }

  /** 是否有长时间任务正在执行 */
  get isBusy(): boolean {
    return this.taskName !== null;
  }

  /** 当前任务名称 */
  get busyTaskName(): string {
    return this.taskName ?? '';
  }

  /** 取消当前正在执行的任务 */
  cancelTask(): boolean {
    if (!this.taskName) {
      return false;
    }
    this.taskCancelled = true;
    if (this.taskProcess) {
      this.taskProcess.kill('SIGTERM');
    }
    // 启动/重启过程中取消 → 杀死正在等待 ready 的 Worker
    if (this.worker && !this.ready) {
      this.worker.kill('SIGTERM');
    }
    logger.info(`[Yunzai] 用户取消任务: ${this.taskName}`);

    return true;
  }

  // ─── Git 操作 ───

  async install(repoUrl = getDefaultRepo()): Promise<void> {
    const yunzaiDir = getYunzaiDir();

    if (this.isInstalled) {
      throw new Error(`Yunzai 已安装在 ${yunzaiDir}`);
    }

    this.beginTask('安装');
    try {
      logger.info(`[Yunzai] 正在克隆 ${repoUrl} ...`);
      await this.git(['clone', '--depth', '1', '--single-branch', repoUrl, yunzaiDir]);
      this.throwIfCancelled();
      this.ensureWorkspaces();
      this.throwIfCancelled();
      logger.info('[Yunzai] 克隆完成，正在安装依赖...');
      await this.npmInstall(yunzaiDir);
      this.throwIfCancelled();
      logger.info('[Yunzai] 依赖安装完成');
    } catch (err) {
      // 安装失败/取消 → 清理残留目录，避免 isInstalled 死锁
      if (existsSync(yunzaiDir)) {
        try {
          rmSync(yunzaiDir, { recursive: true, force: true });
          logger.info('[Yunzai] 安装失败，已清理残留目录');
        } catch (rmErr: any) {
          logger.warn(`[Yunzai] 清理残留目录失败: ${rmErr.message}`);
        }
      }
      throw err;
    } finally {
      this.endTask();
    }
  }

  async update(): Promise<string> {
    if (!this.isInstalled) {
      throw new Error('Yunzai 未安装');
    }
    this.beginTask('更新');
    try {
      logger.info('[Yunzai] 正在拉取更新...');
      const out = await this.git(['pull'], getYunzaiDir());

      this.throwIfCancelled();
      logger.info('[Yunzai] 更新完成');

      return out;
    } finally {
      this.endTask();
    }
  }

  /** 更新代码 + 重装依赖（如正在运行则先停后启，全程单锁） */
  async updateAll(): Promise<string> {
    if (!this.isInstalled) {
      throw new Error('Yunzai 未安装');
    }
    this.beginTask('更新');
    try {
      const wasRunning = this.isRunning;

      if (wasRunning) {
        await this.stopInternal();
      }
      this.throwIfCancelled();
      logger.info('[Yunzai] 正在拉取更新...');
      const out = await this.git(['pull'], getYunzaiDir());

      this.throwIfCancelled();
      this.ensureWorkspaces();
      this.throwIfCancelled();
      logger.info('[Yunzai] 正在安装依赖...');
      await this.npmInstall(getYunzaiDir());
      this.throwIfCancelled();
      logger.info('[Yunzai] 更新完成，依赖已重装');
      if (wasRunning) {
        await this.startInternal();
        logger.info('[Yunzai] Worker 已自动重启');
      }

      return out;
    } finally {
      this.endTask();
    }
  }

  // ─── 进程控制（公开方法，带任务锁） ───

  async start(): Promise<void> {
    this.beginTask('启动');
    try {
      await this.startInternal();
    } finally {
      this.endTask();
    }
  }

  async stop(): Promise<void> {
    this.beginTask('停止');
    try {
      await this.stopInternal();
    } finally {
      this.endTask();
    }
  }

  async restart(): Promise<void> {
    this.beginTask('重启');
    try {
      this.restartCount = 0;
      await this.stopInternal();
      this.throwIfCancelled();
      await this.startInternal();
    } finally {
      this.endTask();
    }
  }

  /** 安装并自动启动（原子操作，单锁覆盖完整流程） */
  async installAndStart(repoUrl = getDefaultRepo()): Promise<void> {
    const yunzaiDir = getYunzaiDir();

    if (this.isInstalled) {
      throw new Error(`Yunzai 已安装在 ${yunzaiDir}`);
    }
    this.beginTask('安装');
    try {
      // 安装阶段
      try {
        logger.info(`[Yunzai] 正在克隆 ${repoUrl} ...`);
        await this.git(['clone', '--depth', '1', '--single-branch', repoUrl, yunzaiDir]);
        this.throwIfCancelled();
        this.ensureWorkspaces();
        this.throwIfCancelled();
        logger.info('[Yunzai] 克隆完成，正在安装依赖...');
        await this.npmInstall(yunzaiDir);
        this.throwIfCancelled();
        logger.info('[Yunzai] 依赖安装完成');
      } catch (err) {
        // 安装失败 → 清理残留目录
        if (existsSync(yunzaiDir)) {
          try {
            rmSync(yunzaiDir, { recursive: true, force: true });
          } catch {}
          logger.info('[Yunzai] 安装失败，已清理残留目录');
        }
        throw err;
      }
      // 启动阶段（安装成功后才执行）
      await this.startInternal();
    } finally {
      this.endTask();
    }
  }

  /** 卸载 Yunzai（删除整个安装目录） */
  async uninstall(): Promise<void> {
    if (!this.isInstalled) {
      throw new Error('Yunzai 未安装');
    }
    this.beginTask('卸载');
    try {
      if (this.isRunning) {
        await this.stopInternal();
      }
      rmSync(getYunzaiDir(), { recursive: true, force: true });
      logger.info('[Yunzai] Yunzai 已卸载');
    } finally {
      this.endTask();
    }
  }

  // ─── 进程控制（内部方法，无锁） ───

  private async startInternal(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Worker 已在运行');
    }
    if (!this.isInstalled) {
      logger.warn('[Yunzai] 未安装，跳过启动');

      return;
    }

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

    // 退出监听 & 自动重启（仅在正常运行时触发，任务进行中跳过）
    this.worker.on('exit', (code, signal) => {
      logger.info(`[Yunzai] Worker 退出 code=${code} signal=${signal}`);
      this.worker = null;
      this.ready = false;

      if (code !== 0 && this.restartCount < this.maxRestarts && !this.isBusy) {
        this.restartCount++;
        logger.info(`[Yunzai] 自动重启 (${this.restartCount}/${this.maxRestarts})...`);
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          this.start().catch(err => {
            logger.error(`[Yunzai] 自动重启失败: ${err.message}`);
          });
        }, 3000);
      }
    });

    // 阻塞等待 ready 信号（同时监听 exit 避免 Worker 崩溃后挂起 30s）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Worker 启动超时 (30s)'));
      }, 30_000);

      const handler = (msg: WorkerToParent) => {
        if (msg.type === 'ready') {
          cleanup();
          this.ready = true;
          this.restartCount = 0;
          logger.info(`[Yunzai] Worker 就绪，已加载 ${msg.pluginCount} 个插件`);
          resolve();
        } else if (msg.type === 'error') {
          cleanup();
          reject(new Error(msg.message));
        }
      };

      const exitHandler = (code: number | null) => {
        cleanup();
        reject(new Error(`Worker 启动时退出 (code=${code})`));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.worker?.removeListener('message', handler);
        this.worker?.removeListener('exit', exitHandler);
      };

      this.worker!.on('message', handler);
      this.worker!.once('exit', exitHandler);
    });
  }

  private async stopInternal(): Promise<void> {
    if (!this.isRunning || !this.worker) {
      return;
    }

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

  // ─── IPC 通信 ───

  send(msg: ParentToWorker): void {
    if (!this.worker || !this.isRunning) {
      return;
    }
    try {
      this.worker.send(msg);
    } catch (err: any) {
      logger.warn(`[Yunzai] IPC 发送失败: ${err.message}`);
    }
  }

  /** 注册回复处理器，返回取消函数 */
  onReply(handler: ReplyHandler): () => void {
    this.replyHandlers.add(handler);

    return () => this.replyHandlers.delete(handler);
  }

  /** 注册 done 处理器（Worker deal() 完成时回调） */
  onDone(handler: (done: any) => void): () => void {
    this.doneHandlers.add(handler);

    return () => this.doneHandlers.delete(handler);
  }

  // ─── 内部方法 ───

  private handleMessage(msg: WorkerToParent): void {
    switch (msg.type) {
      case 'reply':
        for (const h of this.replyHandlers) {
          h(msg);
        }
        break;
      case 'done':
        for (const h of this.doneHandlers) {
          h(msg);
        }
        break;
      case 'error':
        logger.error(`[Yunzai:worker] ${msg.message}`);
        break;
      case 'log': {
        const fn = logger[msg.level];

        if (typeof fn === 'function') {
          fn.call(logger, `[Yunzai] ${msg.args.join(' ')}`);
        }
        break;
      }
      // 'ready' 在 start() 的 Promise handler 中处理
    }
  }

  private beginTask(name: string): void {
    if (this.taskName) {
      throw new Error(`正在${this.taskName}，请等待完成或发送 #yz取消`);
    }
    this.taskName = name;
    this.taskCancelled = false;
  }

  private endTask(): void {
    this.taskName = null;
    this.taskProcess = null;
    this.taskCancelled = false;
  }

  private throwIfCancelled(): void {
    if (this.taskCancelled) {
      throw new Error('操作已取消');
    }
  }

  private git(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cp = execFile('git', args, { cwd, timeout: 1_800_000 }, (err, stdout, stderr) => {
        this.taskProcess = null;
        if (err) {
          const hint = (err as any).killed ? ' (超时)' : '';
          const detail = stderr?.trim() ? `${stderr.trim()}\n${err.message}` : err.message;

          reject(new Error(`${detail}${hint}`));
        } else {
          resolve(stdout);
        }
      });

      this.taskProcess = cp;
    });
  }

  /** 使用内置 yarn 安装依赖（原生支持 workspaces，插件子包依赖一并安装） */
  private npmInstall(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cp = execFile(process.execPath, [YARN_PATH, 'install', '--production=false'], { cwd, timeout: 1_800_000 }, (err, stdout, stderr) => {
        this.taskProcess = null;
        if (err) {
          const hint = (err as any).killed ? ' (超时)' : '';
          const detail = stderr?.trim() ? `${stderr.trim()}\n${err.message}` : err.message;

          reject(new Error(`${detail}${hint}`));
        } else {
          resolve(stdout);
        }
      });

      this.taskProcess = cp;
    });
  }

  /** 安装插件到 plugins 目录 */
  async installPlugin(plugin: PluginInfo): Promise<void> {
    if (!this.isInstalled) {
      throw new Error('Yunzai 未安装');
    }
    const pluginDir = `${getYunzaiDir()}/plugins/${plugin.dirName}`;

    if (existsSync(pluginDir)) {
      throw new Error(`${plugin.label} 已安装`);
    }
    this.beginTask('安装插件');
    try {
      const repoUrl = `${getGhProxy()}${plugin.repoUrl}`;

      logger.info(`[Yunzai] 正在安装 ${plugin.label}...`);
      await this.git(['clone', '--depth', '1', '--single-branch', repoUrl, pluginDir]);
      this.throwIfCancelled();
      this.ensureWorkspaces();
      logger.info('[Yunzai] 正在安装插件依赖...');
      await this.npmInstall(getYunzaiDir());
      this.throwIfCancelled();
      logger.info(`[Yunzai] ${plugin.label} 安装完成`);
    } catch (err) {
      if (existsSync(pluginDir)) {
        try {
          rmSync(pluginDir, { recursive: true, force: true });
        } catch {}
      }
      throw err;
    } finally {
      this.endTask();
    }
  }

  /** 重新安装依赖（用于依赖缺失后修复） */
  async installDeps(): Promise<string> {
    if (!this.isInstalled) {
      throw new Error('Yunzai 未安装');
    }
    this.beginTask('安装依赖');
    try {
      this.ensureWorkspaces();
      this.throwIfCancelled();
      logger.info('[Yunzai] 正在安装依赖...');
      const out = await this.npmInstall(getYunzaiDir());

      this.throwIfCancelled();
      logger.info('[Yunzai] 依赖安装完成');

      return out;
    } finally {
      this.endTask();
    }
  }

  /**
   * 确保 package.json 包含 private 和 workspaces 字段
   * Yarn 1.x 要求 private: true 才能启用 workspaces
   */
  private ensureWorkspaces(): void {
    const pkgPath = `${getYunzaiDir()}/package.json`;

    if (!existsSync(pkgPath)) {
      return;
    }

    let pkg: any;

    try {
      const raw = readFileSync(pkgPath, 'utf-8');

      pkg = JSON.parse(raw);
    } catch (err: any) {
      logger.warn(`[Yunzai] package.json 解析失败: ${err.message}`);

      return;
    }
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
}

export const manager = new YunzaiManager();
