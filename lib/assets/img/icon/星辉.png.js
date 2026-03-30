const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../星辉-D8W-mI1o.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
