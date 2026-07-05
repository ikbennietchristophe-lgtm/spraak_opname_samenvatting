import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const isProd = process.env.NODE_ENV === "production";
const PORT = 3000;

// Lazy initialize Gemini client to prevent crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing on the server.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API endpoint for Gemini summarization
  app.post("/api/summarize", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Ongeldige tekst opgegeven." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Maak een beknopte, heldere samenvatting in het Nederlands van de volgende ingesproken tekst. Geef ook een heel korte, beschrijvende titel (maximaal 6 woorden) die deze samenvatting perfect beschrijft:\n\n"${text}"`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: "De professionele en gestructureerde samenvatting van de tekst in het Nederlands."
              },
              title: {
                type: Type.STRING,
                description: "Een zeer beknopte, krachtige titel (maximaal 6 woorden) van de samenvatting."
              }
            },
            required: ["summary", "title"]
          }
        }
      });

      let responseText = response.text || "{}";
      responseText = responseText.trim();

      // Strip any markdown wrappers like ```json ... ``` or ``` ... ```
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      responseText = responseText.trim();

      let summary = "Geen samenvatting gegenereerd.";
      let title = "Spraakopname Samenvatting";

      try {
        const parsed = JSON.parse(responseText);
        summary = parsed.summary || summary;
        title = parsed.title || title;
      } catch (parseErr) {
        console.warn("Kon de JSON-response niet direct parsen, proberen op te vangen:", responseText);
        // Fallback search
        const summaryMatch = responseText.match(/"summary"\s*:\s*"([^"]+)"/);
        const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
        if (summaryMatch) summary = summaryMatch[1];
        if (titleMatch) title = titleMatch[1];
        
        if (!summaryMatch && !titleMatch) {
          summary = responseText;
        }
      }

      return res.json({ summary, title });
    } catch (error: any) {
      console.error("Fout bij samenvatten:", error);
      return res.status(500).json({
        error: error.message || "Er is een interne fout opgetreden bij het genereren van de samenvatting."
      });
    }
  });

  // Serve static assets / Vite middleware
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server gestart op http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fout bij opstarten server:", err);
});
