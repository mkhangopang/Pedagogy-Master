
declare module 'pdf-parse' {
  function PDFParse(dataBuffer: any, options?: any): Promise<any>;
  export default PDFParse;
}

declare module 'pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js';
