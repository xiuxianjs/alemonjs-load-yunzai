const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../攻略-R2--pcMO.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
