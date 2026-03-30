const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../问号-CS2hHhBV.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
