import { GoogleGenAI, Type, Schema } from "@google/genai";
import { GISMetadata, GraphData, TokenizationData, AssetStatus, ScanType, TaxonomyData, ItemAttributes, SceneryAttributes, ReadingOrderBlock } from "../types";

const GEMINI_MODEL = "gemini-2.5-flash";

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
  taxonomy?: TaxonomyData;
  itemAttributes?: ItemAttributes;
  sceneryAttributes?: SceneryAttributes;
  alt_text_short?: string;
  alt_text_long?: string;
  reading_order?: ReadingOrderBlock[];
  accessibility_score?: number;
}

export const processImageWithGemini = async (
  file: File, 
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT
): Promise<ProcessResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(file);

  const locString = location 
    ? `The image was captured at Latitude: ${location.lat}, Longitude: ${location.lng}.` 
    : "No geolocation data available for this image. Infer location context solely from visual cues.";

  const prompt = `
    You are an expert museum curator, field biologist, and professional museum access specialist writing for blind and low-vision visitors.
    The user is scanning a real-world thing of type: ${scanType}.
    ${locString}

    Return strict JSON matching the schema with:
    - "scan_type": "${scanType}"
    - Full iNaturalist taxonomy if living or once-living (Kingdom -> Species).
    - eBay/Smithsonian attributes if artifact (Material, Technique, Maker).
    - Architectural details if building/landscape (Style, Era, Architect).
    - Always include confidence_score (0.00–1.00).

    **Accessibility Requirements (Crucial):**
    1. "alt_text_short": One clear sentence under 125 characters. Start with the most important object.
    2. "alt_text_long": 3–7 sentences. Describe subject position, colors, textures, materials, emotional tone, and text content (read exactly).
    3. "reading_order": Array of text blocks in logical reading order.
    4. "accessibility_score": 0.00-1.00 based on clarity.

    Perform the following tasks:
    1. **OCR & Cleaning**: Transcribe all text (RAW_OCR) and correct errors (PREPROCESS_OCR).
    2. **Deep Metadata**:
       - Timestamps: Specific dates (OCR) and inferred eras (NLP).
       - GIS Zones: Visual environment and inferred region.
       - Provenance: Creator and Rights.
    3. **Graph & NLP**: Identify Nodes, Categorize topic, Title (Dublin Core), Description (PREMIS).
    4. **Safety**: Flag access restrictions.
  `;

  const schema: Schema = {
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
      keywordsTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      accessRestrictions: { type: Type.BOOLEAN },
      confidenceScore: { type: Type.NUMBER },
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
    required: ["ocrText", "preprocessOcrTranscription", "gisMetadata", "graphData", "tokenization", "analysis", "documentTitle", "documentDescription", "rightsStatement", "languageCode", "keywordsTags"]
  };

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { role: 'user', parts: [imagePart, { text: prompt }] },
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    const parsed = JSON.parse(text) as ProcessResponse;

    return {
      ...parsed,
      keywordsTags: parsed.keywordsTags || [],
      gisMetadata: { ...parsed.gisMetadata, nearbyLandmarks: parsed.gisMetadata?.nearbyLandmarks || [] },
      graphData: { nodes: parsed.graphData?.nodes || [], links: parsed.graphData?.links || [] },
      tokenization: { ...parsed.tokenization, topTokens: parsed.tokenization?.topTokens || [], embeddingVectorPreview: parsed.tokenization?.embeddingVectorPreview || [] },
      taxonomy: parsed.taxonomy,
      itemAttributes: parsed.itemAttributes,
      sceneryAttributes: parsed.sceneryAttributes,
      alt_text_short: parsed.alt_text_short,
      alt_text_long: parsed.alt_text_long,
      reading_order: parsed.reading_order,
      accessibility_score: parsed.accessibility_score
    };
  } catch (error) {
    console.error("Gemini Processing Error:", error);
    throw error;
  }
};

export const simulateNFTMinting = (assetId: string): any => {
    return {
        contractAddress: "0x71C...9A21",
        tokenId: `SHARD-${Math.floor(Math.random() * 10000)}`,
        totalShards: 1000,
        availableShards: 1000,
        pricePerShard: 0.05,
        ownership: [{ holder: "Deployer (You)", percentage: 100 }]
    };
};