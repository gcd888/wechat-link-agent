/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module 'sql.js' {
  function initSqlJs(config?: any): Promise<any>
  export = initSqlJs
  export as namespace initSqlJs
}
