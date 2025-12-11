import { GoogleGenAI, Type, Schema } from "@google/genai";
import { GISMetadata, GraphData, TokenizationData, AssetStatus } from "../types";

const GEMINI_MODEL = "gemini-2.5-flash";

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
}

export const processImageWithGemini = async (
  file: File, 
  location: { lat: number; lng: number } | null
): Promise<ProcessResponse> => {
  
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Check VITE_GEMINI_API_KEY in Vercel env vars.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const imagePart = await fileToGenerativePart(file);

  const locString = location 
    ? `The image was captured at Latitude: ${location.lat}, Longitude: ${location.lng}.` 
    : "No geolocation data available for this image. Infer location context solely from visual cues.";

  const prompt = `
    Analyze the provided image for a strict SQL-based historical archival system.
    ${locString}

    Perform the following complex extraction tasks:

    1. **OCR & Cleaning**: 
       - Transcribe all visible text (RAW_OCR). 
       - Create a "Preprocessed" version (PREPROCESS_OCR) by correcting scanning errors and bias.
    
    2. **Deep Metadata Extraction**:
       - **Timestamps**: Find specific dates in text (OCR_DERIVED) and infer general time periods (NLP_DERIVED, e.g., "Late 19th Century" based on style/content).
       - **GIS Zones**: 
          - LOCAL_GIS_ZONE: What is the visual environment? (Urban, Rural, etc.)
          - OCR_DERIVED_GIS_ZONE: Are there specific city/state names in the text?
          - NLP_DERIVED_GIS_ZONE: Based on context (e.g., mention of "Confederacy" implies US South), what is the region?
       - **Provenance**: Identify the Creator Agent (Author/Org) and Rights Statement (Public Domain, Copyright).
    
    3. **Graph & NLP**: 
       - Identify Nodes (People, Places, Orgs).
       - Categorize the overall topic (NLP_NODE_CATEGORIZATION).
       - Generate a Title (Dublin Core) and Description (PREMIS).

    4. **Safety & Tokenization**:
       - Flag access restrictions (Sensitive topics).
       - Provide token count and embedding preview.

    Return the result as a strict JSON object matching the schema.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      ocrText: { type: Type.STRING, description: "Raw full text transcription" },
      preprocessOcrTranscription: { type: Type.STRING, description: "Cleaned text for NLP" },
      analysis: { type: Type.STRING, description: "Brief contextual summary" },
      
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
      keywordsTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      accessRestrictions: { type: Type.BOOLEAN },
      confidenceScore: { type: Type.NUMBER, description: "0.0 to 1.0 confidence in extraction" },

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
      "documentTitle", "documentDescription", "rightsStatement", "languageCode", "keywordsTags"
    ]
  };

  try {
    const response = await ai.models.generateContent({
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
    
    // Parse and Sanitize to ensure arrays exist
    const parsed = JSON.parse(text) as ProcessResponse;

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
      }
    };

  } catch (error) {
    console.error("Gemini Processing Error:", error);
    throw error;
  }
};

// Mock function to "Mint" an NFT
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