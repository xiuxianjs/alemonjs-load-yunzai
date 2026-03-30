const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../打卡-Cif-Qb30.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
