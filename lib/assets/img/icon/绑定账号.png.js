const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../绑定账号-DL2NyycT.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
