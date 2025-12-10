import { GoogleGenAI, Type, Schema } from "@google/genai";
import { GISMetadata, GraphData, TokenizationData, DigitalAsset, AssetStatus } from "../types";

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
  ocrText: string;
  gisMetadata: GISMetadata;
  graphData: GraphData;
  tokenization: TokenizationData;
  analysis: string;
}

export const processImageWithGemini = async (
  file: File, 
  location: { lat: number; lng: number } | null
): Promise<ProcessResponse> => {
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imagePart = await fileToGenerativePart(file);

  const locString = location 
    ? `The image was captured at Latitude: ${location.lat}, Longitude: ${location.lng}.` 
    : "No geolocation data available for this image.";

  const prompt = `
    Analyze the provided image for a digital archival system.
    ${locString}

    Perform the following tasks:
    1. **OCR**: Transcribe all visible text accurately.
    2. **GIS Inference**: Based on the image visual context and coordinates (if provided), infer GIS-style metadata (zone type, terrain, potential landmarks).
    3. **Graph Extraction**: Identify key entities (Nodes) such as People, Places, Organizations, Dates, and Concepts. Determine relationships (Links) between them.
    4. **Tokenization Analysis**: Identify key tokens useful for LLM training and simulate an embedding vector preview (5 random floats).
    5. **Contextual Analysis**: A brief summary of what this document/image represents in a legal or geospatial context.

    Return the result as a strict JSON object.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      ocrText: { type: Type.STRING, description: "Full text transcription" },
      analysis: { type: Type.STRING, description: "Brief contextual summary" },
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
    required: ["ocrText", "gisMetadata", "graphData", "tokenization", "analysis"]
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
    
    return JSON.parse(text) as ProcessResponse;

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
