const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../ledger-CcEgaxwd.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
