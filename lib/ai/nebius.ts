import OpenAI from "openai";

//API config for nebius
export const nebius = new OpenAI({
  apiKey: process.env.SPACT_NEBIUS_API_KEY,
  baseURL: "https://api.tokenfactory.nebius.com/v1/",
});
