/**
 * Edge OCR Service with WebAssembly
 * 
 * Provides offline-first OCR pre-processing using Tesseract.js WASM modules.
 * Only escalates to Gemini for NLP refinement, reducing API costs and latency.
 * 
 * @module edgeOCRService
 */

import { createWorker, Worker, RecognizeResult } from 'tesseract.js';
import { logger } from '../lib/logger';
import { CircuitBreaker } from '../lib/circuitBreaker';

const circuitBreaker = new CircuitBreaker();

// Edge OCR Configuration
const EDGE_OCR_CONFIG = {
  CONFIDENCE_THRESHOLD: 0.70, // Below this, escalate to Gemini
  MAX_WORKERS: 4,
  WORKER_TIMEOUT_MS: 30000,
  CACHE_TTL_MS: 3600000, // 1 hour
  SUPPORTED_LANGUAGES: ['eng', 'fra', 'deu', 'spa', 'ita', 'por', 'nld'],
  IMAGE_MAX_WIDTH: 2048,
  IMAGE_MAX_HEIGHT: 2048,
};

/**
 * Edge OCR result structure
 */
export interface EdgeOCRResult {
  text: string;
  confidence: number;
  words: WordResult[];
  blocks: BlockResult[];
  processingTime: number;
  needsGeminiRefinement: boolean;
  language: string;
  imageHash: string;
}

/**
 * Word-level result
 */
export interface WordResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  baseline: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Block-level result (paragraphs)
 */
export interface BlockResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  lines: LineResult[];
}

/**
 * Line-level result
 */
export interface LineResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  words: WordResult[];
}

/**
 * Bounding box coordinates
 */
export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

/**
 * Pre-processing options
 */
export interface PreProcessingOptions {
  grayscale?: boolean;
  contrast?: number;
  brightness?: number;
  denoise?: boolean;
  deskew?: boolean;
  binarize?: boolean;
  threshold?: number;
}

/**
 * Worker pool item
 */
interface WorkerPoolItem {
  worker: Worker;
  busy: boolean;
  language: string;
  lastUsed: number;
}

/**
 * Cache entry for processed images
 */
interface CacheEntry {
  result: EdgeOCRResult;
  timestamp: number;
}

/**
 * Edge OCR Service Class
 */
class EdgeOCRService {
  private workerPool: Map<string, WorkerPoolItem[]> = new Map();
  private resultCache: Map<string, CacheEntry> = new Map();
  private initialized = false;

  /**
   * Initialize the edge OCR service
   */
  async initialize(languages: string[] = ['eng']): Promise<boolean> {
    try {
      for (const lang of languages) {
        await this.initializeWorkerForLanguage(lang);
      }
      
      this.initialized = true;
      logger.info('Edge OCR Service initialized', { languages });
      
      // Start cache cleanup interval
      setInterval(() => this.cleanupCache(), EDGE_OCR_CONFIG.CACHE_TTL_MS / 2);
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize Edge OCR Service', { error });
      return false;
    }
  }

  /**
   * Initialize a Tesseract worker for a specific language
   */
  private async initializeWorkerForLanguage(language: string): Promise<void> {
    const worker = await createWorker(language, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          logger.debug('OCR progress', { progress: m.progress });
        }
      },
    });

    const workers = this.workerPool.get(language) || [];
    workers.push({
      worker,
      busy: false,
      language,
      lastUsed: Date.now(),
    });
    this.workerPool.set(language, workers);
  }

  /**
   * Get available worker for a language
   */
  private async getWorker(language: string): Promise<WorkerPoolItem | null> {
    let workers = this.workerPool.get(language);
    
    if (!workers || workers.length === 0) {
      if (EDGE_OCR_CONFIG.SUPPORTED_LANGUAGES.includes(language)) {
        await this.initializeWorkerForLanguage(language);
        workers = this.workerPool.get(language);
      } else {
        return null;
      }
    }

    // Find available worker
    let availableWorker = workers?.find(w => !w.busy);
    
    if (!availableWorker && workers && workers.length < EDGE_OCR_CONFIG.MAX_WORKERS) {
      // Create new worker if pool not full
      await this.initializeWorkerForLanguage(language);
      workers = this.workerPool.get(language);
      availableWorker = workers?.find(w => !w.busy);
    }

    return availableWorker || null;
  }

  /**
   * Generate hash for image caching
   */
  private async generateImageHash(imageData: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', imageData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check cache for existing result
   */
  private getCachedResult(imageHash: string): EdgeOCRResult | null {
    const entry = this.resultCache.get(imageHash);
    if (entry && Date.now() - entry.timestamp < EDGE_OCR_CONFIG.CACHE_TTL_MS) {
      return entry.result;
    }
    return null;
  }

  /**
   * Cache OCR result
   */
  private cacheResult(imageHash: string, result: EdgeOCRResult): void {
    this.resultCache.set(imageHash, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [hash, entry] of this.resultCache) {
      if (now - entry.timestamp > EDGE_OCR_CONFIG.CACHE_TTL_MS) {
        this.resultCache.delete(hash);
      }
    }
  }

  /**
   * Pre-process image using Canvas API
   */
  async preprocessImage(
    imageData: Blob | ArrayBuffer | string,
    options: PreProcessingOptions = {}
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Create canvas for processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Scale image if necessary
        let width = img.width;
        let height = img.height;
        
        if (width > EDGE_OCR_CONFIG.IMAGE_MAX_WIDTH) {
          const ratio = EDGE_OCR_CONFIG.IMAGE_MAX_WIDTH / width;
          width = EDGE_OCR_CONFIG.IMAGE_MAX_WIDTH;
          height = Math.floor(height * ratio);
        }
        
        if (height > EDGE_OCR_CONFIG.IMAGE_MAX_HEIGHT) {
          const ratio = EDGE_OCR_CONFIG.IMAGE_MAX_HEIGHT / height;
          height = EDGE_OCR_CONFIG.IMAGE_MAX_HEIGHT;
          width = Math.floor(width * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Apply pre-processing filters
        if (options.grayscale || options.binarize) {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            
            // Apply contrast
            let adjusted = gray;
            if (options.contrast) {
              const factor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));
              adjusted = factor * (gray - 128) + 128;
            }
            
            // Apply brightness
            if (options.brightness) {
              adjusted += options.brightness;
            }
            
            // Clamp values
            adjusted = Math.max(0, Math.min(255, adjusted));
            
            // Binarize if requested
            if (options.binarize) {
              const threshold = options.threshold || 128;
              adjusted = adjusted > threshold ? 255 : 0;
            }
            
            data[i] = adjusted;
            data[i + 1] = adjusted;
            data[i + 2] = adjusted;
          }
          
          ctx.putImageData(imageData, 0, 0);
        }

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      };

      img.onerror = () => reject(new Error('Failed to load image'));

      // Set image source
      if (typeof imageData === 'string') {
        img.src = imageData;
      } else if (imageData instanceof Blob) {
        img.src = URL.createObjectURL(imageData);
      } else {
        img.src = URL.createObjectURL(new Blob([imageData]));
      }
    });
  }

  /**
   * Perform edge OCR on an image
   */
  async recognizeText(
    imageData: Blob | ArrayBuffer | string,
    options: {
      language?: string;
      preprocess?: PreProcessingOptions;
      forceRefresh?: boolean;
    } = {}
  ): Promise<EdgeOCRResult> {
    const startTime = Date.now();
    const language = options.language || 'eng';

    // Convert to ArrayBuffer for hashing
    let arrayBuffer: ArrayBuffer;
    if (typeof imageData === 'string') {
      const response = await fetch(imageData);
      arrayBuffer = await response.arrayBuffer();
    } else if (imageData instanceof Blob) {
      arrayBuffer = await imageData.arrayBuffer();
    } else {
      arrayBuffer = imageData;
    }

    // Check cache
    const imageHash = await this.generateImageHash(arrayBuffer);
    if (!options.forceRefresh) {
      const cached = this.getCachedResult(imageHash);
      if (cached) {
        logger.debug('Returning cached OCR result', { imageHash });
        return cached;
      }
    }

    // Pre-process image if requested
    let processedImage: Blob | ArrayBuffer | string = imageData;
    if (options.preprocess) {
      processedImage = await this.preprocessImage(imageData, options.preprocess);
    }

    // Get worker
    const workerItem = await this.getWorker(language);
    if (!workerItem) {
      throw new Error(`No worker available for language: ${language}`);
    }

    workerItem.busy = true;
    workerItem.lastUsed = Date.now();

    try {
      // Perform OCR with timeout
      const recognizePromise = workerItem.worker.recognize(processedImage);
      
      const result = await Promise.race([
        recognizePromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OCR timeout')), EDGE_OCR_CONFIG.WORKER_TIMEOUT_MS)
        ),
      ]) as RecognizeResult;

      const processingTime = Date.now() - startTime;

      // Parse result
      const edgeResult = this.parseRecognizeResult(result, {
        processingTime,
        language,
        imageHash,
      });

      // Cache result
      this.cacheResult(imageHash, edgeResult);

      logger.info('Edge OCR completed', {
        confidence: edgeResult.confidence,
        wordCount: edgeResult.words.length,
        processingTime,
        needsRefinement: edgeResult.needsGeminiRefinement,
      });

      return edgeResult;
    } finally {
      workerItem.busy = false;
    }
  }

  /**
   * Parse Tesseract result to EdgeOCRResult
   */
  private parseRecognizeResult(
    result: RecognizeResult,
    metadata: { processingTime: number; language: string; imageHash: string }
  ): EdgeOCRResult {
    const { data } = result;
    
    const words: WordResult[] = data.words.map((word: any) => ({
      text: word.text,
      confidence: word.confidence / 100,
      bbox: {
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
      },
      baseline: word.baseline,
    }));

    const blocks: BlockResult[] = data.blocks.map((block: any) => ({
      text: block.text,
      confidence: block.confidence / 100,
      bbox: {
        x0: block.bbox.x0,
        y0: block.bbox.y0,
        x1: block.bbox.x1,
        y1: block.bbox.y1,
        width: block.bbox.x1 - block.bbox.x0,
        height: block.bbox.y1 - block.bbox.y0,
      },
      lines: block.lines.map((line: any) => ({
        text: line.text,
        confidence: line.confidence / 100,
        bbox: {
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1,
          width: line.bbox.x1 - line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0,
        },
        words: line.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence / 100,
          bbox: {
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1,
            width: w.bbox.x1 - w.bbox.x0,
            height: w.bbox.y1 - w.bbox.y0,
          },
          baseline: w.baseline,
        })),
      })),
    }));

    const overallConfidence = data.confidence / 100;
    const needsGeminiRefinement = overallConfidence < EDGE_OCR_CONFIG.CONFIDENCE_THRESHOLD;

    return {
      text: data.text,
      confidence: overallConfidence,
      words,
      blocks,
      processingTime: metadata.processingTime,
      needsGeminiRefinement,
      language: metadata.language,
      imageHash: metadata.imageHash,
    };
  }

  /**
   * Perform OCR with automatic Gemini escalation
   */
  async recognizeWithEscalation(
    imageData: Blob | ArrayBuffer | string,
    options: {
      language?: string;
      preprocess?: PreProcessingOptions;
      geminiApiKey?: string;
      forceGemini?: boolean;
    } = {}
  ): Promise<{
    edgeResult: EdgeOCRResult;
    geminiResult?: any;
    escalated: boolean;
  }> {
    // First, try edge OCR
    const edgeResult = await this.recognizeText(imageData, {
      language: options.language,
      preprocess: options.preprocess,
    });

    // Check if we need to escalate to Gemini
    const shouldEscalate = options.forceGemini || edgeResult.needsGeminiRefinement;

    if (!shouldEscalate) {
      return {
        edgeResult,
        escalated: false,
      };
    }

    // Escalate to Gemini for NLP refinement
    if (!options.geminiApiKey) {
      logger.warn('Gemini escalation needed but no API key provided');
      return {
        edgeResult,
        escalated: false,
      };
    }

    try {
      const geminiResult = await this.escalateToGemini(
        imageData,
        edgeResult,
        options.geminiApiKey
      );

      return {
        edgeResult,
        geminiResult,
        escalated: true,
      };
    } catch (error) {
      logger.error('Gemini escalation failed', { error });
      return {
        edgeResult,
        escalated: false,
      };
    }
  }

  /**
   * Escalate to Gemini for NLP refinement
   */
  private async escalateToGemini(
    imageData: Blob | ArrayBuffer | string,
    edgeResult: EdgeOCRResult,
    apiKey: string
  ): Promise<any> {
    // Convert image to base64
    let base64Image: string;
    if (typeof imageData === 'string' && imageData.startsWith('data:')) {
      base64Image = imageData.split(',')[1];
    } else {
      let arrayBuffer: ArrayBuffer;
      if (imageData instanceof Blob) {
        arrayBuffer = await imageData.arrayBuffer();
      } else if (typeof imageData === 'string') {
        const response = await fetch(imageData);
        arrayBuffer = await response.arrayBuffer();
      } else {
        arrayBuffer = imageData;
      }
      base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    const prompt = `You are refining OCR output. The edge OCR system extracted the following text with ${(edgeResult.confidence * 100).toFixed(1)}% confidence:

---
${edgeResult.text}
---

Please analyze the image and provide:
1. Corrected text with proper formatting
2. Extracted entities (people, places, dates, organizations)
3. Key topics and keywords
4. Document type classification
5. Any additional context or metadata

Respond in JSON format.`;

    const response = await circuitBreaker.execute(
      async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: base64Image,
                    },
                  },
                ],
              }],
              generationConfig: {
                responseMimeType: 'application/json',
              },
            }),
          }
        );
        return res.json();
      }
    );

    return response;
  }

  /**
   * Terminate all workers
   */
  async terminate(): Promise<void> {
    for (const [language, workers] of this.workerPool) {
      for (const item of workers) {
        await item.worker.terminate();
      }
    }
    this.workerPool.clear();
    this.resultCache.clear();
    this.initialized = false;
    logger.info('Edge OCR Service terminated');
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    languages: string[];
    workerCount: number;
    cacheSize: number;
  } {
    let totalWorkers = 0;
    const languages: string[] = [];
    
    for (const [lang, workers] of this.workerPool) {
      languages.push(lang);
      totalWorkers += workers.length;
    }

    return {
      initialized: this.initialized,
      languages,
      workerCount: totalWorkers,
      cacheSize: this.resultCache.size,
    };
  }
}

// Export singleton instance
export const edgeOCRService = new EdgeOCRService();

/**
 * Plugin adapter for edge OCR
 */
export const createEdgeOCRPlugin = () => ({
  id: 'edge-ocr',
  name: 'Edge OCR with WebAssembly',
  version: '1.0.0',
  
  async initialize() {
    return edgeOCRService.initialize(['eng']);
  },

  async processImage(
    imageData: Blob | ArrayBuffer | string,
    options?: { language?: string; geminiApiKey?: string }
  ) {
    return edgeOCRService.recognizeWithEscalation(imageData, options);
  },

  async terminate() {
    return edgeOCRService.terminate();
  },
});

export default edgeOCRService;
