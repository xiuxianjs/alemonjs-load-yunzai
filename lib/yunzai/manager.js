import { logger } from 'alemonjs';
import { fork, execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getYunzaiDir, getDefaultRepo, WORKER_PATH, YARN_PATH, getMiaoPluginRepo } from '../path.js';

class YunzaiManager {
    worker = null;
    ready = false;
    replyHandlers = new Set();
    doneHandlers = new Set();
    restartCount = 0;
    maxRestarts = 3;
    restartTimer = null;
    get isInstalled() {
        return existsSync(getYunzaiDir());
    }
    get isRunning() {
        return this.worker !== null && !this.worker.killed;
    }
    get isReady() {
        return this.ready;
    }
    getStatus() {
        if (!this.isInstalled)
            return '未安装';
        if (!this.isRunning)
            return '已停止';
        if (!this.ready)
            return '启动中';
        return '运行中';
    }
    async install(repoUrl = getDefaultRepo()) {
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
    async update() {
        if (!this.isInstalled)
            throw new Error('Yunzai 未安装');
        logger.info('[Yunzai] 正在拉取更新...');
        const out = await this.git(['pull'], getYunzaiDir());
        logger.info('[Yunzai] 更新完成');
        return out;
    }
    async start() {
        if (this.isRunning)
            throw new Error('Worker 已在运行');
        if (!this.isInstalled) {
            logger.warn('[Yunzai] 未安装，跳过启动。发送 #yunzai安装 进行安装');
            return;
        }
        await this.ensureMiaoPlugin();
        this.ready = false;
        this.worker = fork(WORKER_PATH, [], {
            cwd: getYunzaiDir(),
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            env: { ...process.env, YUNZAI_DIR: getYunzaiDir() }
        });
        this.worker.stdout?.on('data', (buf) => {
            for (const line of buf.toString().split('\n').filter(Boolean)) {
                logger.info(`[Yunzai:out] ${line}`);
            }
        });
        this.worker.stderr?.on('data', (buf) => {
            for (const line of buf.toString().split('\n').filter(Boolean)) {
                logger.warn(`[Yunzai:err] ${line}`);
            }
        });
        this.worker.on('message', (msg) => {
            this.handleMessage(msg);
        });
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
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.worker.removeListener('message', handler);
                reject(new Error('Worker 启动超时 (30s)'));
            }, 30_000);
            const handler = (msg) => {
                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    this.worker.removeListener('message', handler);
                    this.ready = true;
                    this.restartCount = 0;
                    logger.info(`[Yunzai] Worker 就绪，已加载 ${msg.pluginCount} 个插件`);
                    resolve();
                }
                else if (msg.type === 'error') {
                    clearTimeout(timeout);
                    this.worker.removeListener('message', handler);
                    reject(new Error(msg.message));
                }
            };
            this.worker.on('message', handler);
        });
    }
    async stop() {
        if (!this.isRunning || !this.worker)
            return;
        this.ready = false;
        this.restartCount = this.maxRestarts;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        this.send({ type: 'shutdown' });
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.worker?.kill('SIGKILL');
                resolve();
            }, 5000);
            this.worker.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        this.worker = null;
    }
    async restart() {
        this.restartCount = 0;
        await this.stop();
        await this.start();
    }
    send(msg) {
        if (!this.worker || !this.isRunning)
            return;
        this.worker.send(msg);
    }
    onReply(handler) {
        this.replyHandlers.add(handler);
        return () => this.replyHandlers.delete(handler);
    }
    onDone(handler) {
        this.doneHandlers.add(handler);
        return () => this.doneHandlers.delete(handler);
    }
    handleMessage(msg) {
        switch (msg.type) {
            case 'reply':
                for (const h of this.replyHandlers)
                    h(msg);
                break;
            case 'done':
                for (const h of this.doneHandlers)
                    h(msg);
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
        }
    }
    git(args, cwd) {
        return new Promise((resolve, reject) => {
            execFile('git', args, { cwd }, (err, stdout, stderr) => {
                if (err)
                    reject(new Error(stderr || err.message));
                else
                    resolve(stdout);
            });
        });
    }
    npmInstall(cwd) {
        return new Promise((resolve, reject) => {
            execFile(process.execPath, [YARN_PATH, 'install', '--production=false'], { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
                if (err)
                    reject(new Error(stderr || err.message));
                else
                    resolve(stdout);
            });
        });
    }
    async installDeps() {
        if (!this.isInstalled)
            throw new Error('Yunzai 未安装');
        this.ensureWorkspaces();
        await this.ensureMiaoPlugin();
        logger.info('[Yunzai] 正在安装依赖...');
        const out = await this.npmInstall(getYunzaiDir());
        logger.info('[Yunzai] 依赖安装完成');
        return out;
    }
    ensureWorkspaces() {
        const pkgPath = `${getYunzaiDir()}/package.json`;
        if (!existsSync(pkgPath))
            return;
        let pkg;
        try {
            const raw = readFileSync(pkgPath, 'utf-8');
            pkg = JSON.parse(raw);
        }
        catch (err) {
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
    async ensureMiaoPlugin() {
        const pluginDir = `${getYunzaiDir()}/plugins/miao-plugin`;
        if (existsSync(pluginDir))
            return;
        logger.info('[Yunzai] miao-plugin 未安装，正在克隆...');
        await this.git(['clone', '--depth', '1', getMiaoPluginRepo(), pluginDir]);
        logger.info('[Yunzai] miao-plugin 安装完成');
    }
}
const manager = new YunzaiManager();

export { manager };
