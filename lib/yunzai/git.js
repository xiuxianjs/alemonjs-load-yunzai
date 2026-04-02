import { logger } from 'alemonjs';
import { execFileSync, execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { join } from 'node:path';

let _hasNativeGit = null;
function hasNativeGit() {
    if (_hasNativeGit !== null) {
        return _hasNativeGit;
    }
    try {
        execFileSync('git', ['--version'], { timeout: 5000, stdio: 'ignore' });
        _hasNativeGit = true;
        logger.info('[Git] 检测到本地 git');
    }
    catch {
        _hasNativeGit = false;
        logger.info('[Git] 未检测到本地 git，将使用 isomorphic-git');
    }
    return _hasNativeGit;
}
function nativeExec(args, cwd) {
    let cp;
    const promise = new Promise((resolve, reject) => {
        cp = execFile('git', args, { cwd, timeout: 1_800_000 }, (err, stdout, stderr) => {
            if (err) {
                const hint = err.killed ? ' (超时)' : '';
                const detail = stderr?.trim() ? `${stderr.trim()}\n${err.message}` : err.message;
                reject(new Error(`${detail}${hint}`));
            }
            else {
                resolve(stdout);
            }
        });
    });
    return { promise, process: cp };
}
let _isoGit = null;
let _isoHttp = null;
async function iso() {
    if (!_isoGit) {
        _isoGit = await import('isomorphic-git');
        const httpMod = await import('isomorphic-git/http/node');
        _isoHttp = httpMod.default ?? httpMod;
    }
    return { git: _isoGit, http: _isoHttp };
}
function gitClone(url, dir) {
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
function gitFetchAll(dir) {
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
function gitResetHard(dir) {
    if (hasNativeGit()) {
        return nativeExec(['reset', '--hard', 'origin/HEAD'], dir);
    }
    return {
        process: null,
        promise: (async () => {
            const { git } = await iso();
            const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? 'master';
            let remoteSha;
            try {
                remoteSha = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` });
            }
            catch {
                remoteSha = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/HEAD' });
            }
            const refsDir = join(dir, '.git', 'refs', 'heads');
            if (!fs.existsSync(refsDir)) {
                fs.mkdirSync(refsDir, { recursive: true });
            }
            fs.writeFileSync(join(refsDir, branch), remoteSha + '\n');
            await git.checkout({ fs, dir, ref: branch, force: true });
            return 'reset complete';
        })()
    };
}
function gitPull(dir) {
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

export { gitClone, gitFetchAll, gitPull, gitResetHard, hasNativeGit };
