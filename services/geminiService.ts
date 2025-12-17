import { GoogleGenAI, Type } from "@google/genai";
import { GISMetadata, GraphData, TokenizationData, AssetStatus, ScanType, TaxonomyData, ItemAttributes, SceneryAttributes, ReadingOrderBlock } from "../types";

// Using Gemini 2.5 Flash as requested for optimized speed and efficient extraction
const GEMINI_MODEL = "gemini-2.5-flash";

// Helper to obtain API Key exclusively from process.env.API_KEY as per guidelines
const getApiKey = (): string => {
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
  ocrText: string;
  gisMetadata: GISMetadata;
  graphData: GraphData;
  tokenization: TokenizationData;
  analysis: string;
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
  suggestedCollection: string;
  taxonomy?: TaxonomyData;
  itemAttributes?: ItemAttributes;
  sceneryAttributes?: SceneryAttributes;
  alt_text_short?: string;
  alt_text_long?: string;
  reading_order?: ReadingOrderBlock[];
  accessibility_score?: number;
}

let aiInstance: GoogleGenAI | null = null;
const getAiClient = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) {
        console.warn("Gemini API Key is missing. Calls will fail.");
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

export const processImageWithGemini = async (
  file: File, 
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT
): Promise<ProcessResponse> => {
  
  const apiKey = getApiKey();
  if (!apiKey) {
      throw new Error("Missing Gemini API Key. Please configure your environment variables.");
  }

  const imagePart = await fileToGenerativePart(file);

  const locString = location 
    ? `The image was captured at Latitude: ${location.lat}, Longitude: ${location.lng}.` 
    : "No geolocation data available for this image. Infer location context solely from visual cues.";

  const prompt = `
    You are an expert data extraction specialist and knowledge graph engineer.
    The user is scanning a visual input of type: ${scanType}.
    ${locString}

    **CRITICAL GRAPH EXTRACTION RULES:**
    1. **List/Table Extraction**: If the image contains a list, table, roster, or catalog of items, extract EVERY SINGLE ITEM as a separate Node.
    2. **Node Types**: PERSON, LOCATION, ORGANIZATION, DATE, CONCEPT.
    
    **NAMING & GROUPING:**
    - Provide a specific "documentTitle" for the file.
    - Provide a "suggestedCollection" name.

    Return strict JSON matching the schema.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      ocrText: { type: Type.STRING },
      preprocessOcrTranscription: { type: Type.STRING },
      analysis: { type: Type.STRING },
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
      ocrDerivedTimestamp: { type: Type.STRING, nullable: true },
      nlpDerivedTimestamp: { type: Type.STRING, nullable: true },
      documentTitle: { type: Type.STRING },
      documentDescription: { type: Type.STRING },
      creatorAgent: { type: Type.STRING, nullable: true },
      rightsStatement: { type: Type.STRING },
      languageCode: { type: Type.STRING },
      nlpNodeCategorization: { type: Type.STRING },
      suggestedCollection: { type: Type.STRING },
      keywordsTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      accessRestrictions: { type: Type.BOOLEAN },
      confidenceScore: { type: Type.NUMBER },
      taxonomy: { type: Type.OBJECT, nullable: true },
      itemAttributes: { type: Type.OBJECT, nullable: true },
      sceneryAttributes: { type: Type.OBJECT, nullable: true },
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
                type: { type: Type.STRING },
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
      tokenization: {
        type: Type.OBJECT,
        properties: {
          tokenCount: { type: Type.INTEGER },
          vocabularySize: { type: Type.INTEGER },
          topTokens: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          embeddingVectorPreview: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["tokenCount"]
      }
    },
    required: [
      "ocrText", "preprocessOcrTranscription", "gisMetadata", "graphData", "tokenization", "analysis",
      "documentTitle", "documentDescription", "rightsStatement", "languageCode", "keywordsTags", "suggestedCollection"
    ]
  };

  try {
    const response = await getAiClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        role: 'user',
        parts: [
          imagePart,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as ProcessResponse;
  } catch (error) {
    console.error("Gemini Processing Error:", error);
    throw error;
  }
};