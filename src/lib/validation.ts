/**
 * Runtime Validation Layer
 * 
 * Provides Zod-like runtime validation for ensuring data consistency
 * and LLM output validity. Critical for training data quality assurance.
 * 
 * @module validation
 * @version 2.0.0
 */

import type {
  GISMetadata,
  GraphData,
  GraphNode,
  GraphLink,
  TokenizationData,
  ReadingOrderBlock,
} from '../types';

// ============================================
// Validation Result Types
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  received?: unknown;
  expected?: string;
}

// ============================================
// Validator Functions
// ============================================

/**
 * Validates a string value with optional constraints
 */
export function validateString(
  value: unknown,
  path: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    enum?: readonly string[];
  } = {}
): ValidationResult<string> {
  const errors: ValidationError[] = [];
  
  if (value === null || value === undefined || value === '') {
    if (options.required) {
      errors.push({ path, message: 'Required field is missing', received: value });
      return { success: false, errors };
    }
    return { success: true, data: '', errors: [] };
  }
  
  if (typeof value !== 'string') {
    errors.push({ path, message: 'Expected string', received: typeof value, expected: 'string' });
    return { success: false, errors };
  }
  
  if (options.minLength && value.length < options.minLength) {
    errors.push({ path, message: `Minimum length is ${options.minLength}`, received: value.length });
  }
  
  if (options.maxLength && value.length > options.maxLength) {
    errors.push({ path, message: `Maximum length is ${options.maxLength}`, received: value.length });
  }
  
  if (options.pattern && !options.pattern.test(value)) {
    errors.push({ path, message: `Does not match pattern ${options.pattern}`, received: value });
  }
  
  if (options.enum && !options.enum.includes(value)) {
    errors.push({ path, message: `Must be one of: ${options.enum.join(', ')}`, received: value });
  }
  
  return { success: errors.length === 0, data: value, errors };
}

/**
 * Validates a number value with optional constraints
 */
export function validateNumber(
  value: unknown,
  path: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): ValidationResult<number> {
  const errors: ValidationError[] = [];
  
  if (value === null || value === undefined) {
    if (options.required) {
      errors.push({ path, message: 'Required field is missing', received: value });
      return { success: false, errors };
    }
    return { success: true, data: 0, errors: [] };
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (typeof num !== 'number' || isNaN(num)) {
    errors.push({ path, message: 'Expected number', received: typeof value, expected: 'number' });
    return { success: false, errors };
  }
  
  if (options.min !== undefined && num < options.min) {
    errors.push({ path, message: `Minimum value is ${options.min}`, received: num });
  }
  
  if (options.max !== undefined && num > options.max) {
    errors.push({ path, message: `Maximum value is ${options.max}`, received: num });
  }
  
  if (options.integer && !Number.isInteger(num)) {
    errors.push({ path, message: 'Must be an integer', received: num });
  }
  
  return { success: errors.length === 0, data: num, errors };
}

/**
 * Validates a boolean value
 */
export function validateBoolean(
  value: unknown,
  path: string,
  required = false
): ValidationResult<boolean> {
  const errors: ValidationError[] = [];
  
  if (value === null || value === undefined) {
    if (required) {
      errors.push({ path, message: 'Required field is missing', received: value });
      return { success: false, errors };
    }
    return { success: true, data: false, errors: [] };
  }
  
  if (typeof value !== 'boolean') {
    errors.push({ path, message: 'Expected boolean', received: typeof value, expected: 'boolean' });
    return { success: false, errors };
  }
  
  return { success: true, data: value, errors: [] };
}

/**
 * Validates an array with optional item validation
 */
export function validateArray<T>(
  value: unknown,
  path: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    itemValidator?: (item: unknown, index: number) => ValidationResult<T>;
  } = {}
): ValidationResult<T[]> {
  const errors: ValidationError[] = [];
  
  if (value === null || value === undefined) {
    if (options.required) {
      errors.push({ path, message: 'Required field is missing', received: value });
      return { success: false, errors };
    }
    return { success: true, data: [], errors: [] };
  }
  
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'Expected array', received: typeof value, expected: 'array' });
    return { success: false, errors };
  }
  
  if (options.minLength && value.length < options.minLength) {
    errors.push({ path, message: `Minimum length is ${options.minLength}`, received: value.length });
  }
  
  if (options.maxLength && value.length > options.maxLength) {
    errors.push({ path, message: `Maximum length is ${options.maxLength}`, received: value.length });
  }
  
  const validatedItems: T[] = [];
  
  if (options.itemValidator) {
    for (let i = 0; i < value.length; i++) {
      const itemResult = options.itemValidator(value[i], i);
      if (!itemResult.success) {
        errors.push(...itemResult.errors.map(e => ({
          ...e,
          path: `${path}[${i}].${e.path}`
        })));
      } else if (itemResult.data !== undefined) {
        validatedItems.push(itemResult.data);
      }
    }
  } else {
    validatedItems.push(...(value as T[]));
  }
  
  return { success: errors.length === 0, data: validatedItems, errors };
}

// ============================================
// Domain-Specific Validators
// ============================================

/**
 * Validates GIS metadata from Gemini output
 * Note: GISMetadata uses string-based fields, not numeric coordinates
 */
export function validateGISMetadata(data: unknown, path = 'gisMetadata'): ValidationResult<GISMetadata> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path, message: 'GIS metadata must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const gis = data as Record<string, unknown>;
  
  // Validate string fields (GISMetadata uses string-based zone/elevation)
  const zoneResult = validateString(gis.zoneType || gis.suggestedGisZone, `${path}.zoneType`);
  const elevResult = validateString(gis.estimatedElevation || String(gis.altitude || ''), `${path}.estimatedElevation`);
  const envResult = validateString(gis.environmentalContext, `${path}.environmentalContext`);
  const coordResult = validateString(gis.coordinateSystem, `${path}.coordinateSystem`);
  
  errors.push(...zoneResult.errors, ...elevResult.errors, ...envResult.errors, ...coordResult.errors);
  
  // Validate landmarks array
  const landmarksResult = validateArray<string>(
    gis.nearbyLandmarks,
    `${path}.nearbyLandmarks`,
    { itemValidator: (item, i) => validateString(item, `item[${i}]`) }
  );
  
  errors.push(...landmarksResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      zoneType: zoneResult.data || '',
      estimatedElevation: elevResult.data || '',
      nearbyLandmarks: landmarksResult.data || [],
      environmentalContext: envResult.data || '',
      coordinateSystem: coordResult.data || 'WGS84',
    },
    errors: [],
  };
}

/**
 * Validates a graph node
 */
export function validateGraphNode(data: unknown, path = 'node'): ValidationResult<GraphNode> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path, message: 'Graph node must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const node = data as Record<string, unknown>;
  
  const idResult = validateString(node.id, `${path}.id`, { required: true });
  const labelResult = validateString(node.label, `${path}.label`, { required: true });
  const typeResult = validateString(node.type, `${path}.type`, {
    required: true,
    enum: ['PERSON', 'LOCATION', 'ORGANIZATION', 'DATE', 'CONCEPT'] as const,
  });
  const relevanceResult = validateNumber(node.relevance, `${path}.relevance`, {
    required: true,
    min: 0,
    max: 1,
  });
  
  errors.push(...idResult.errors, ...labelResult.errors, ...typeResult.errors, ...relevanceResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      id: idResult.data!,
      label: labelResult.data!,
      type: typeResult.data as GraphNode['type'],
      relevance: relevanceResult.data!,
    },
    errors: [],
  };
}

/**
 * Validates a graph link
 */
export function validateGraphLink(data: unknown, path = 'link'): ValidationResult<GraphLink> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path, message: 'Graph link must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const link = data as Record<string, unknown>;
  
  const sourceResult = validateString(link.source, `${path}.source`, { required: true });
  const targetResult = validateString(link.target, `${path}.target`, { required: true });
  const relResult = validateString(link.relationship, `${path}.relationship`, { required: true });
  
  errors.push(...sourceResult.errors, ...targetResult.errors, ...relResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      source: sourceResult.data!,
      target: targetResult.data!,
      relationship: relResult.data!,
    },
    errors: [],
  };
}

/**
 * Validates graph data structure
 */
export function validateGraphData(data: unknown, path = 'graphData'): ValidationResult<GraphData> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path, message: 'Graph data must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const graph = data as Record<string, unknown>;
  
  const nodesResult = validateArray(graph.nodes, `${path}.nodes`, {
    required: true,
    itemValidator: (item, i) => validateGraphNode(item, `nodes[${i}]`),
  });
  
  const linksResult = validateArray(graph.links, `${path}.links`, {
    itemValidator: (item, i) => validateGraphLink(item, `links[${i}]`),
  });
  
  errors.push(...nodesResult.errors, ...linksResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      nodes: nodesResult.data || [],
      links: linksResult.data || [],
    },
    errors: [],
  };
}

/**
 * Validates tokenization data
 */
export function validateTokenizationData(data: unknown, path = 'tokenization'): ValidationResult<TokenizationData> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path, message: 'Tokenization data must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const token = data as Record<string, unknown>;
  
  const countResult = validateNumber(token.tokenCount, `${path}.tokenCount`, { required: true, min: 0, integer: true });
  const vocabResult = validateNumber(token.vocabularySize, `${path}.vocabularySize`, { min: 0, integer: true });
  
  errors.push(...countResult.errors, ...vocabResult.errors);
  
  // Validate topTokens array
  const topTokensResult = validateArray(token.topTokens, `${path}.topTokens`, {
    itemValidator: (item, i) => {
      if (!item || typeof item !== 'object') {
        return { success: false, data: { token: '', frequency: 0 }, errors: [{ path: `topTokens[${i}]`, message: 'Expected object' }] };
      }
      const t = item as Record<string, unknown>;
      const tokenStrResult = validateString(t.token, 'token', { required: true });
      const freqResult = validateNumber(t.frequency, 'frequency', { required: true, min: 0, integer: true });
      
      if (!tokenStrResult.success || !freqResult.success) {
        return { success: false, data: { token: '', frequency: 0 }, errors: [...tokenStrResult.errors, ...freqResult.errors] };
      }
      
      return {
        success: true,
        data: { token: tokenStrResult.data!, frequency: freqResult.data! },
        errors: [],
      };
    },
  });
  
  errors.push(...topTokensResult.errors);
  
  // Validate embedding vector
  const embeddingResult = validateArray<number>(token.embeddingVectorPreview, `${path}.embeddingVectorPreview`, {
    itemValidator: (item) => validateNumber(item, 'embedding'),
  });
  
  errors.push(...embeddingResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      tokenCount: countResult.data!,
      vocabularySize: vocabResult.data || 0,
      topTokens: topTokensResult.data || [],
      embeddingVectorPreview: embeddingResult.data || [],
    },
    errors: [],
  };
}

/**
 * Validates accessibility score (0-100)
 */
export function validateAccessibilityScore(value: unknown, path = 'accessibility_score'): ValidationResult<number> {
  return validateNumber(value, path, { min: 0, max: 100 });
}

/**
 * Validates reading order blocks
 */
export function validateReadingOrder(data: unknown, path = 'reading_order'): ValidationResult<ReadingOrderBlock[]> {
  return validateArray<ReadingOrderBlock>(data, path, {
    itemValidator: (item, i) => {
      if (!item || typeof item !== 'object') {
        return { success: false, data: { text: '', position: '' }, errors: [{ path: `${path}[${i}]`, message: 'Expected object' }] };
      }
      const block = item as Record<string, unknown>;
      const textResult = validateString(block.text, 'text', { required: true });
      const posResult = validateString(block.position, 'position', { required: true });
      
      if (!textResult.success || !posResult.success) {
        return { success: false, data: { text: '', position: '' }, errors: [...textResult.errors, ...posResult.errors] };
      }
      
      return {
        success: true,
        data: { text: textResult.data!, position: posResult.data! },
        errors: [],
      };
    },
  });
}

// ============================================
// Comprehensive Document Validation
// ============================================

/**
 * Validates the complete Gemini processing response
 * This is the main entry point for LLM output validation
 */
export function validateGeminiResponse(data: unknown): ValidationResult<{
  ocrText: string;
  gisMetadata: GISMetadata;
  graphData: GraphData;
  tokenization: TokenizationData;
  documentTitle: string;
  documentDescription: string;
  confidenceScore: number;
  keywordsTags: string[];
  alt_text_short?: string;
  alt_text_long?: string;
  accessibility_score?: number;
}> {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({ path: 'root', message: 'Response must be an object', received: typeof data });
    return { success: false, errors };
  }
  
  const response = data as Record<string, unknown>;
  
  // Required fields
  const ocrResult = validateString(response.ocrText, 'ocrText', { required: true });
  const titleResult = validateString(response.documentTitle, 'documentTitle', { required: true, maxLength: 500 });
  const descResult = validateString(response.documentDescription, 'documentDescription', { required: true, maxLength: 5000 });
  const confidenceResult = validateNumber(response.confidenceScore, 'confidenceScore', { required: true, min: 0, max: 1 });
  
  errors.push(...ocrResult.errors, ...titleResult.errors, ...descResult.errors, ...confidenceResult.errors);
  
  // Complex types
  const gisResult = validateGISMetadata(response.gisMetadata);
  const graphResult = validateGraphData(response.graphData);
  const tokenResult = validateTokenizationData(response.tokenization);
  
  errors.push(...gisResult.errors, ...graphResult.errors, ...tokenResult.errors);
  
  // Keywords array
  const keywordsResult = validateArray<string>(response.keywordsTags, 'keywordsTags', {
    required: true,
    itemValidator: (item) => validateString(item, 'keyword'),
  });
  
  errors.push(...keywordsResult.errors);
  
  // Optional accessibility fields
  const altShortResult = validateString(response.alt_text_short, 'alt_text_short', { maxLength: 250 });
  const altLongResult = validateString(response.alt_text_long, 'alt_text_long', { maxLength: 2000 });
  const accessResult = validateAccessibilityScore(response.accessibility_score);
  
  errors.push(...altShortResult.errors, ...altLongResult.errors, ...accessResult.errors);
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      ocrText: ocrResult.data!,
      gisMetadata: gisResult.data!,
      graphData: graphResult.data!,
      tokenization: tokenResult.data!,
      documentTitle: titleResult.data!,
      documentDescription: descResult.data!,
      confidenceScore: confidenceResult.data!,
      keywordsTags: keywordsResult.data || [],
      alt_text_short: altShortResult.data || undefined,
      alt_text_long: altLongResult.data || undefined,
      accessibility_score: accessResult.data || undefined,
    },
    errors: [],
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Formats validation errors for logging or display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `[${e.path}] ${e.message}${e.received !== undefined ? ` (got: ${JSON.stringify(e.received)})` : ''}`).join('\n');
}

/**
 * Asserts that validation passed, throwing if it failed
 */
export function assertValid<T>(result: ValidationResult<T>, context?: string): T {
  if (!result.success) {
    const errorMsg = formatValidationErrors(result.errors);
    throw new Error(`Validation failed${context ? ` (${context})` : ''}:\n${errorMsg}`);
  }
  return result.data!;
}

/**
 * Validates and sanitizes LLM output, returning defaults for invalid fields
 */
export function sanitizeLLMOutput<T>(
  result: ValidationResult<T>,
  defaults: T
): T {
  if (result.success && result.data) {
    return result.data;
  }
  
  // Log validation issues but return defaults for resilience
  if (result.errors.length > 0) {
    console.warn('LLM output validation issues:', formatValidationErrors(result.errors));
  }
  
  return defaults;
}
