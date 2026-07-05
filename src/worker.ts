/**
 * Cloudflare Worker for Spraakopname en Samenvatting
 * 
 * Dit script handelt de API-aanvragen af voor de samenvatting via de Gemini API.
 * Upload dit bestand naar Cloudflare Workers en stel de GEMINI_API_KEY omgevingsvariabele in.
 */

export interface Env {
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Enkel POST-aanvragen zijn toegestaan." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const url = new URL(request.url);

    // Endpoint for summarization
    if (url.pathname === "/api/summarize") {
      try {
        const body = await request.json() as any;
        const text = body?.text;

        if (!text || typeof text !== "string") {
          return new Response(JSON.stringify({ error: "Ongeldige tekst opgegeven." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "GEMINI_API_KEY is niet ingesteld in de Cloudflare Worker omgeving." }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        // Direct call to Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Maak een beknopte, heldere samenvatting in het Nederlands van de volgende ingesproken tekst. Zorg voor een professionele en gestructureerde toon:\n\n"${text}"`
                  }
                ]
              }
            ]
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API fout: ${response.status} - ${errText}`);
        }

        const data = await response.json() as any;
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || "Geen samenvatting gegenereerd.";

        return new Response(JSON.stringify({ summary }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || "Er is een fout opgetreden bij het verwerken van de aanvraag." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Niet gevonden." }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};
