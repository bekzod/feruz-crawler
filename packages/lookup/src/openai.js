import OpenAI from "openai";

export function createOpenAiTranslator(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    async translate(field, text) {
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Translate the given Japanese car-listing value to a short English term. Reply with ONLY the English term, lowercase, no punctuation." },
          { role: "user", content: `Field: ${field}\nValue: ${text}` }
        ]
      });
      return res.choices[0]?.message?.content?.trim().toLowerCase() || null;
    }
  };
}
