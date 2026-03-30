const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../纠缠之缘--9rM65-Q.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
