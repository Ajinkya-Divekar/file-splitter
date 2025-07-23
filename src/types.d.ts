// src/types.d.ts

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.pdf' {
  const fileUrl: string;
  export default fileUrl;
}
