
// Fix: Import Buffer to provide types for PDFParse which operates on Node.js Buffer objects.
import { Buffer } from 'buffer';

declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }
  // PDFParse requires a Buffer as its first argument.
  function PDFParse(dataBuffer: Buffer, options?: any): Promise<PDFData>;
  export default PDFParse;
}

declare module 'pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js';
