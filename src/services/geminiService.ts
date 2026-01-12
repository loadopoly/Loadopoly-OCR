import { GoogleGenAI, Type, Schema } from "@google/genai";
import { GISMetadata, GraphData, TokenizationData, AssetStatus, ScanType, TaxonomyData, ItemAttributes, SceneryAttributes, ReadingOrderBlock } from "../types";
import { validateGeminiResponse, sanitizeLLMOutput, formatValidationErrors } from "../lib/validation";
import { geminiLogger as logger } from "../lib/logger";
import { geminiCircuitBreaker } from "../lib/circuitBreaker";

// Using Gemini 2.5 Flash as requested for optimized speed and efficient extraction
const GEMINI_MODEL = "gemini-2.5-flash";

// Helper to obtain API Key from environment variables or localStorage
const getApiKey = (): string => {
  // Check localStorage first (user-configured)
  if (typeof localStorage !== 'undefined') {
    const selectedLLM = localStorage.getItem('geograph-selected-llm');
    if (selectedLLM === 'Gemini 2.5 Flash') {
      const savedKey = localStorage.getItem('geograph-llm-key-Gemini 2.5 Flash') || localStorage.getItem('geograph-gemini-key');
      if (savedKey) return savedKey;
    }
  }

  // Vite environment variables (prefixed with VITE_)
  // @ts-ignore - Vite's import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
    // @ts-ignore
    if (import.meta.env.API_KEY) return import.meta.env.API_KEY;
  }
  
  // Node.js environment variables
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  return '';
};

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface ProcessResponse {
  // Original Props
  ocrText: string;
  gisMetadata: GISMetadata;
  graphData: GraphData;
  tokenization: TokenizationData;
  analysis: string;

  // New Structured DB Props
  ocrDerivedTimestamp: string | null;
  nlpDerivedTimestamp: string | null;
  ocrDerivedGisZone: string | null;
  nlpDerivedGisZone: string | null;
  nlpNodeCategorization: string;
  preprocessOcrTranscription: string;
  documentTitle: string;
  documentDescription: string;
  creatorAgent: string | null;
  rightsStatement: string;
  languageCode: string;
  confidenceScore: number;
  keywordsTags: string[];
  accessRestrictions: boolean;
  associativeItemTag: string | null;
  
  // Suggested Collection Name (replaces Batch Ingest)
  suggestedCollection: string;

  // Scan Type Specific
  taxonomy?: TaxonomyData;
  itemAttributes?: ItemAttributes;
  sceneryAttributes?: SceneryAttributes;

  // Accessibility
  alt_text_short?: string;
  alt_text_long?: string;
  reading_order?: ReadingOrderBlock[];
  accessibility_score?: number;
}

// Lazy initialization to avoid top-level crashes
let aiInstance: GoogleGenAI | null = null;
const getAiClient = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) {
        logger.warn("Gemini API Key is missing. Calls will fail.");
    }
    // Initialize strictly with the provided API key
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

export const processImageWithGemini = async (
  file: File, 
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT,
  debugMode: boolean = false
): Promise<ProcessResponse> => {
  return geminiCircuitBreaker.execute(() => processImageWithGeminiInternal(file, location, scanType, debugMode));
};

const processImageWithGeminiInternal = async (
  file: File, 
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT,
  debugMode: boolean = false
): Promise<ProcessResponse> => {
  
  const apiKey = getApiKey();
  if (!apiKey) {
      logger.error("Gemini API Key is missing", undefined, { operation: 'processImage' });
      throw new Error("Missing Gemini API Key. Please configure VITE_GEMINI_API_KEY in your environment.");
  }

  logger.debug(`Starting Gemini processing`, { 
    operation: 'processImage',
    fileName: file.name, 
    fileType: file.type, 
    fileSize: file.size,
    scanType 
  });

  const imagePart = await fileToGenerativePart(file);

  const locString = location 
    ? `The image was captured at Latitude: ${location.lat}, Longitude: ${location.lng}.` 
    : "No geolocation data available for this image. Infer location context solely from visual cues.";

  const prompt = `
    You are an expert data extraction specialist and knowledge graph engineer.
    The user is scanning a visual input of type: ${scanType}.
    ${locString}

    **CRITICAL GRAPH EXTRACTION RULES:**
    1. **List/Table Extraction**: If the image contains a list, table, roster, or catalog of items (e.g., Pokemon names, chemical elements, inventory parts, attendee list), you MUST extract **EVERY SINGLE ITEM** as a separate Node in the 'graphData.nodes' array.
    2. **No Summaries**: Do not just say "List of Pokemon". Create a specific node for "Pikachu", "Charizard", etc.
    3. **Node Types**: 
       - Use 'CONCEPT' for fictional characters, scientific terms, or objects.
       - Use 'PERSON' for human names.
       - Use 'ORGANIZATION' for companies or groups.
       - Use 'LOCATION' for places.
    4. **Relationships**: Link these item nodes to the main document node or a central concept node (e.g., "Pikachu" -> "TYPE_OF" -> "Pokemon").
    
    **NAMING & GROUPING:**
    - Provide a specific "documentTitle" for the file.
    - Provide a "suggestedCollection" name. Do NOT use "Batch Ingest". E.g., if it's a map, suggest "Cartographic Archives". If it's a receipt, "Financial Records".

    Return strict JSON matching the schema with:
    - "scan_type": "${scanType}"
    - Full iNaturalist taxonomy if living or once-living.
    - Attributes if artifact.
    - Architectural details if building.
    - "confidence_score" (0.00–1.00).

    **Accessibility Requirements:**
    1. "alt_text_short": <125 chars.
    2. "alt_text_long": 3–7 sentences description.
    3. "reading_order": Logical text blocks.
    4. "accessibility_score": 0.00-1.00.

    Perform the following tasks:
    1. **OCR**: Transcribe text (RAW_OCR).
    2. **Metadata**: Timestamps, GIS Zones, Provenance.
    3. **Graph**: Identify ALL Nodes (names/entities), Categorize topic, Title, Description.
    4. **Safety**: Flag restrictions.
    5. **Aggregation**: If this is a physical item, generate a unique "associativeItemTag" based on its visual characteristics (e.g., "vintage-rolex-submariner-1960s"). This tag should be consistent across different angles of the same item.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      ocrText: { type: Type.STRING, description: "Raw full text transcription" },
      preprocessOcrTranscription: { type: Type.STRING, description: "Cleaned text for NLP" },
      analysis: { type: Type.STRING, description: "Brief contextual summary" },
      
      // Accessibility
      alt_text_short: { type: Type.STRING },
      alt_text_long: { type: Type.STRING },
      reading_order: { 
          type: Type.ARRAY, 
          items: { 
              type: Type.OBJECT,
              properties: {
                  text: { type: Type.STRING },
                  position: { type: Type.STRING }
              }
          } 
      },
      accessibility_score: { type: Type.NUMBER },

      // GIS
      gisMetadata: {
        type: Type.OBJECT,
        properties: {
          zoneType: { type: Type.STRING },
          estimatedElevation: { type: Type.STRING },
          nearbyLandmarks: { type: Type.ARRAY, items: { type: Type.STRING } },
          environmentalContext: { type: Type.STRING },
          coordinateSystem: { type: Type.STRING }
        },
        required: ["zoneType", "environmentalContext"]
      },
      ocrDerivedGisZone: { type: Type.STRING, nullable: true },
      nlpDerivedGisZone: { type: Type.STRING, nullable: true },

      // Timestamps
      ocrDerivedTimestamp: { type: Type.STRING, nullable: true, description: "Specific date found in text" },
      nlpDerivedTimestamp: { type: Type.STRING, nullable: true, description: "Inferred era/period" },

      // Document Metadata
      documentTitle: { type: Type.STRING },
      documentDescription: { type: Type.STRING },
      creatorAgent: { type: Type.STRING, nullable: true },
      rightsStatement: { type: Type.STRING },
      languageCode: { type: Type.STRING },
      
      // Classification
      nlpNodeCategorization: { type: Type.STRING },
      suggestedCollection: { type: Type.STRING, description: "Proposed name for the collection this item belongs to" },
      associativeItemTag: { type: Type.STRING, nullable: true, description: "A unique tag for the physical object. If multiple photos are of the same item, this tag MUST be identical." },
      keywordsTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      accessRestrictions: { type: Type.BOOLEAN },
      confidenceScore: { type: Type.NUMBER, description: "0.0 to 1.0 confidence in extraction" },

      // Taxonomy (For Items)
      taxonomy: {
        type: Type.OBJECT,
        nullable: true,
        properties: {
          kingdom: { type: Type.STRING, nullable: true },
          phylum: { type: Type.STRING, nullable: true },
          class: { type: Type.STRING, nullable: true },
          order: { type: Type.STRING, nullable: true },
          family: { type: Type.STRING, nullable: true },
          genus: { type: Type.STRING, nullable: true },
          species: { type: Type.STRING, nullable: true },
          common_name: { type: Type.STRING, nullable: true },
          inaturalist_taxon_id: { type: Type.INTEGER, nullable: true }
        }
      },
      
      // Item Attributes
      itemAttributes: {
        type: Type.OBJECT,
        nullable: true,
        properties: {
          common_name: { type: Type.STRING, nullable: true },
          material: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
          technique: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
          production_date: { type: Type.STRING, nullable: true },
          period_or_style: { type: Type.STRING, nullable: true },
          dimensions: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              height_cm: { type: Type.NUMBER, nullable: true },
              width_cm: { type: Type.NUMBER, nullable: true },
              depth_cm: { type: Type.NUMBER, nullable: true }
            }
          },
          condition: { type: Type.STRING, nullable: true },
          inscriptions_or_marks: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true }
        }
      },

      // Scenery Attributes
      sceneryAttributes: {
        type: Type.OBJECT,
        nullable: true,
        properties: {
          architectural_style: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
          construction_date: { type: Type.STRING, nullable: true },
          architect_or_builder: { type: Type.STRING, nullable: true },
          site_type: { type: Type.STRING, nullable: true },
          common_name: { type: Type.STRING, nullable: true }
        }
      },

      // Graph
      graphData: {
        type: Type.OBJECT,
        properties: {
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["PERSON", "LOCATION", "ORGANIZATION", "DATE", "CONCEPT"] },
                relevance: { type: Type.NUMBER }
              },
              required: ["id", "label", "type", "relevance"]
            }
          },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                relationship: { type: Type.STRING }
              },
              required: ["source", "target", "relationship"]
            }
          }
        },
        required: ["nodes", "links"]
      },

      // Tokenization
      tokenization: {
        type: Type.OBJECT,
        properties: {
          tokenCount: { type: Type.INTEGER },
          vocabularySize: { type: Type.INTEGER },
          topTokens: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                token: { type: Type.STRING },
                frequency: { type: Type.INTEGER }
              }
            }
          },
          embeddingVectorPreview: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["tokenCount", "topTokens"]
      }
    },
    required: [
      "ocrText", "preprocessOcrTranscription", "gisMetadata", "graphData", "tokenization", "analysis",
      "documentTitle", "documentDescription", "rightsStatement", "languageCode", "keywordsTags", "suggestedCollection"
    ]
  };

  try {
    logger.debug("Sending request to Gemini API", { operation: 'processImage' });
    const response = await getAiClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        // @ts-ignore - seed is supported in the latest Gemini API for determinism
        seed: 42
      }
    });

    const text = response.text;
    if (!text) {
      logger.error("Gemini returned an empty response", undefined, { operation: 'processImage' });
      throw new Error("Gemini returned an empty response. This might be due to safety filters or an unsupported image.");
    }
    
    logger.debug("Gemini response received, parsing JSON", { operation: 'processImage' });
    
    // Parse and Sanitize to ensure arrays exist
    const parsed = JSON.parse(text) as ProcessResponse;
    
    // Validate the response for LLM training data quality
    const validationResult = validateGeminiResponse(parsed);
    if (!validationResult.success) {
      logger.warn("Gemini response validation issues detected", {
        operation: 'processImage',
        validationErrors: formatValidationErrors(validationResult.errors),
        errorCount: validationResult.errors.length,
      });
    }

    return {
      ...parsed,
      keywordsTags: parsed.keywordsTags || [],
      gisMetadata: {
        ...parsed.gisMetadata,
        nearbyLandmarks: parsed.gisMetadata?.nearbyLandmarks || []
      },
      graphData: {
        nodes: parsed.graphData?.nodes || [],
        links: parsed.graphData?.links || []
      },
      tokenization: {
        ...parsed.tokenization,
        topTokens: parsed.tokenization?.topTokens || [],
        embeddingVectorPreview: parsed.tokenization?.embeddingVectorPreview || []
      },
      // Ensure specific objects are present if valid, or undefined
      taxonomy: parsed.taxonomy,
      itemAttributes: parsed.itemAttributes,
      sceneryAttributes: parsed.sceneryAttributes,
      alt_text_short: parsed.alt_text_short,
      alt_text_long: parsed.alt_text_long,
      reading_order: parsed.reading_order,
      accessibility_score: parsed.accessibility_score,
      suggestedCollection: parsed.suggestedCollection || "Unsorted Processing"
    };

  } catch (error: unknown) {
    const err = error as Error & { status?: number };
    logger.error("Gemini Processing Error", error, { operation: 'processImage' });
    
    let userFriendlyMessage = "AI processing failed.";
    
    if (err.message?.includes("API key")) {
      userFriendlyMessage = "Invalid or missing API key. Check VITE_GEMINI_API_KEY.";
    } else if (err.message?.includes("safety")) {
      userFriendlyMessage = "Content blocked by safety filters.";
    } else if (err.message?.includes("quota") || err.status === 429) {
      userFriendlyMessage = "API quota exceeded. Please try again later.";
    } else if (err.message?.includes("JSON")) {
      userFriendlyMessage = "Failed to parse AI response. The image might be too complex or blurry.";
    } else if (err.message?.includes("unsupported") || err.message?.includes("format")) {
      userFriendlyMessage = "Unsupported file format or corrupted image.";
    } else if (err.message?.includes("large")) {
      userFriendlyMessage = "File size too large for Gemini processing.";
    } else if (err.message) {
      userFriendlyMessage = err.message;
    }

    if (debugMode) {
      throw new Error(`DEBUG_ERR: ${userFriendlyMessage} | Raw: ${err.message || String(error)}`);
    }
    throw new Error(userFriendlyMessage);
  }
};