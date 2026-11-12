declare module 'pdf-parse' {
  function pdf(data: Buffer): Promise<{ text: string }>
  export default pdf
}
