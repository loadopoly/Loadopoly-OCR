/**
 * OpenAI LLM Provider
 * 
 * Implements the ILLMProvider interface for OpenAI's GPT models.
 * Provides an alternative to Gemini for metadata extraction.
 */

import { BaseLLMProvider } from './abstract';
import {
  LLMCapability,
  LLMConfig,
  MetadataExtractionOptions,
  MetadataExtractionResult,
  UsageInfo,
} from '../types';
import { GraphData } from '../../types';
import { logger } from '../../lib/logger';

// ============================================
// OpenAI Provider Configuration
// ============================================

interface OpenAIConfig extends LLMConfig {
  apiKey?: string;
  model?: string;
  organization?: string;
}

// ============================================
// OpenAI LLM Provider Implementation
// ============================================

export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  displayName = 'OpenAI GPT';
  capabilities: LLMCapability[] = ['vision', 'text-generation', 'embeddings', 'function-calling'];
  priority = 20; // Secondary priority

  private apiKey: string = '';
  private model: string = 'gpt-4o';
  private organization?: string;
  private baseUrl: string = 'https://api.openai.com/v1';

  async init(config: OpenAIConfig): Promise<void> {
    this.config = config;
    
    this.apiKey = config.apiKey || this.getApiKeyFromEnv();
    this.model = config.model || 'gpt-4o';
    this.organization = config.organization;

    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured - provider will be unavailable');
    }

    this.initialized = true;
    logger.info(`OpenAI provider initialized with model: ${this.model}`);
  }

  private getApiKeyFromEnv(): string {
    // @ts-ignore - Vite's import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      if (import.meta.env.VITE_OPENAI_API_KEY) return import.meta.env.VITE_OPENAI_API_KEY;
    }
    
    if (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }
    
    return '';
  }

  async extractMetadata(
    image: Blob,
    options?: MetadataExtractionOptions
  ): Promise<MetadataExtractionResult> {
    this.ensureInitialized();

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Convert blob to base64
      const base64Image = await this.blobToBase64(image);
      
      const scanType = options?.scanType || 'DOCUMENT';
      
      const prompt = this.buildExtractionPrompt(scanType, options);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.organization && { 'OpenAI-Organization': this.organization }),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${image.type || 'image/jpeg'};base64,${base64Image}`,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      const parsed = JSON.parse(content);
      
      // Build graph from extracted data
      const assetId = `asset_${Date.now()}`;
      const graphData = this.buildGraphFromEntities(
        assetId,
        parsed.documentTitle || 'Untitled',
        parsed.entities || []
      );

      return {
        ocrText: parsed.ocrText || '',
        entities: parsed.entities || [],
        keywords: parsed.keywords || [],
        graphData,
        gisMetadata: parsed.gisMetadata,
        confidence: parsed.confidence || 0.75,
        documentTitle: parsed.documentTitle,
        documentDescription: parsed.documentDescription,
        rawAnalysis: parsed.analysis,
      };
    } catch (error) {
      logger.error('OpenAI extraction failed', error);
      throw error;
    }
  }

  private buildExtractionPrompt(scanType: string, options?: MetadataExtractionOptions): string {
    return `You are an expert data extraction specialist. Analyze this image of type: ${scanType}.

Extract and return a JSON object with the following structure:
{
  "ocrText": "Full text transcription from the image",
  "entities": ["List of named entities (people, places, organizations, concepts)"],
  "keywords": ["Relevant keywords/tags"],
  "documentTitle": "A descriptive title for this document",
  "documentDescription": "2-3 sentence description",
  "confidence": 0.0-1.0,
  "analysis": "Brief analysis of the content",
  "gisMetadata": {
    "zoneType": "Geographic zone type if identifiable",
    "environmentalContext": "Environmental context"
  }
}

${options?.includeGIS ? 'Pay special attention to geographic and location information.' : ''}
${options?.includeEntities ? 'Extract ALL named entities, including fictional characters if present.' : ''}

IMPORTANT: 
- Extract EVERY distinct item if the image contains a list or table
- Return valid JSON only`;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    this.ensureInitialized();

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.organization && { 'OpenAI-Organization': this.organization }),
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI Embeddings error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.data[0]?.embedding || [];
    } catch (error) {
      logger.error('OpenAI embeddings failed', error);
      throw error;
    }
  }

  async checkSimilarity(textA: string, textB: string): Promise<number> {
    try {
      const [embA, embB] = await Promise.all([
        this.generateEmbeddings(textA),
        this.generateEmbeddings(textB),
      ]);

      // Cosine similarity
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < embA.length; i++) {
        dotProduct += embA[i] * embB[i];
        normA += embA[i] * embA[i];
        normB += embB[i] * embB[i];
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    } catch (error) {
      // Fall back to default implementation
      return super.checkSimilarity(textA, textB);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...(this.organization && { 'OpenAI-Organization': this.organization }),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getUsageInfo(): Promise<UsageInfo> {
    // OpenAI usage info requires organization-level API access
    return {
      requestsRemaining: undefined,
      tokensRemaining: undefined,
    };
  }
}

// ============================================
// Singleton Export
// ============================================

export const openAIProvider = new OpenAIProvider();
