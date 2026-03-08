import { GoogleGenAI } from "@google/genai";

// Ensure we have the key. In a real app, we handle this more gracefully if missing.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const analyzeVehicleIssue = async (rawDescription: string, vehicleModel: string): Promise<string> => {
  if (!apiKey) {
    console.warn("Gemini API Key missing");
    return rawDescription; // Fallback
  }

  try {
    const model = 'gemini-3-flash-preview';
    const prompt = `
      Você é um consultor técnico automotivo sênior de uma oficina de luxo.
      Analise a seguinte descrição do problema relatado pelo cliente para um veículo ${vehicleModel}.
      
      Descrição bruta: "${rawDescription}"
      
      Sua tarefa:
      1. Reescreva a descrição de forma profissional e técnica.
      2. Sugira possíveis causas baseadas no relato (como hipóteses).
      3. Organize em tópicos claros usando Markdown.
      4. Mantenha um tom sofisticado e direto.
      
      Não inclua preâmbulos, vá direto ao texto formatado.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || rawDescription;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return rawDescription;
  }
};