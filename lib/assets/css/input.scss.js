const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../input.scss-C0fogidd.css', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
