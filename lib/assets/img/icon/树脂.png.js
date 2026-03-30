const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../树脂-cneryQ22.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
