/// <reference types="lvyjs/env" />
/// <reference types="alemonjs/env" />

declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.scss' {
  const src: string;
  export default src;
}
declare module '*.ttf' {
  const url: string;
  export default url;
}
declare module '*.md' {
  const url: string;
  export default url;
}
