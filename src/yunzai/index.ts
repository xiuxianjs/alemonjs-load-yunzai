/**
 * Yunzai 子进程适配层入口
 *
 * manager  — Git 操作 + Worker 进程生命周期
 * bridge   — AlemonJS handler → IPC → Worker
 * protocol — IPC 消息类型定义
 */
export { manager } from './manager';
export { default as yunzaiBridge } from './bridge';
export type * from './protocol';
