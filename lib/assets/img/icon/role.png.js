const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../role-BbTPmFQ4.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
