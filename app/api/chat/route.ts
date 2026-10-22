import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";
import { ChatMessage } from "@/app/types/chatType"; //check
import { createSupabaseServerClient } from "@/lib/superbase/supabase-server";

export async function POST(request: Request) {
  try {
    const { transcript, conversationId } = await request.json();

    if (
      typeof transcript !== "string" ||
      !transcript.trim() ||
      transcript.length > 5000 || //checks around the transcript length
      typeof conversationId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid transcript" },
        { status: 400 },
      );
    }

    //verify the user is authenticated
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: messages, error: historyError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(10);

    if (historyError) {
      console.error("History retrieval failed:", historyError);

      return NextResponse.json(
        { error: "Failed to retrieve conversation history" },
        { status: 500 },
      );
    }

    const history = [...(messages ?? [])].reverse();

    console.log("Conversation history:", history);

    //check api key is available
    if (!process.env.SPACT_NEBIUS_API_KEY) {
      return NextResponse.json(
        { error: "Nebius API key missing" },
        { status: 500 },
      );
    }

    const completion = await nebius.chat.completions.create({
      model: "nvidia/Nemotron-3_5-Lightning",
      messages: [
        {
          role: "system",
          content: `You are Spact, a friendly voice-first
            daily productivity companion.
            Help the user clarify their goals and plans.
            Ask one question at a time.
            Keep responses short and conversational.
            Never claim to have saved a task,
            sent a reminder, or changed a schedule.`,
        },
        ...history,
        {
          role: "user",
          content: transcript,
        },
      ],
      max_tokens: 250,
      // Nebius-specific option passed through the OpenAI-compatible SDK.
      ...{
        chat_template_kwargs: {
          enable_thinking: false,
        },
      },
    });

    const reply = completion.choices[0]?.message?.content;
    console.log(completion.choices[0]?.finish_reason);
    console.log("Input tokens:", completion.usage?.prompt_tokens);
    console.log("Output tokens:", completion.usage?.completion_tokens);

    if (!reply) {
      throw new Error("Empty response from Nebius");
    }
    //save the message transcript and response
    const { error: saveError } = await supabase.from("messages").insert([
      {
        conversation_id: conversationId,
        role: "user",
        content: transcript,
      },
      {
        conversation_id: conversationId,
        role: "assistant",
        content: reply,
      },
    ]);

    if (saveError) {
      console.error("Message save failed:", saveError);

      return NextResponse.json(
        { error: "Failed to save conversation" },
        { status: 500 },
      );
    }

    //return the response
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Nebius request failed:", error);

    return NextResponse.json(
      { error: "Could not generate an AI response" },
      { status: 502 },
    );
  }
}
