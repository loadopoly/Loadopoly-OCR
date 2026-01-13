/**
 * Type declarations for external modules without types
 */

// Tesseract.js type declarations
declare module 'tesseract.js' {
  export interface BBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  export interface Baseline {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  export interface Word {
    text: string;
    confidence: number;
    bbox: BBox;
    baseline: Baseline;
  }

  export interface Line {
    text: string;
    confidence: number;
    bbox: BBox;
    words: Word[];
  }

  export interface Block {
    text: string;
    confidence: number;
    bbox: BBox;
    lines: Line[];
  }

  export interface RecognizeData {
    text: string;
    confidence: number;
    words: Word[];
    blocks: Block[];
  }

  export interface RecognizeResult {
    data: RecognizeData;
  }

  export interface Worker {
    recognize(image: Blob | ArrayBuffer | string): Promise<RecognizeResult>;
    terminate(): Promise<void>;
  }

  export interface WorkerOptions {
    logger?: (message: { status: string; progress: number }) => void;
  }

  export function createWorker(
    language: string,
    oem?: number,
    options?: WorkerOptions
  ): Promise<Worker>;
}

// snarkjs type declarations
declare module 'snarkjs' {
  export namespace groth16 {
    export function fullProve(
      input: Record<string, any>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
      };
      publicSignals: string[];
    }>;

    export function verify(
      verificationKey: any,
      publicSignals: string[],
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
      }
    ): Promise<boolean>;
  }
}
