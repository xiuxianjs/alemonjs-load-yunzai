const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../米游社-BiyV3ayE.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
