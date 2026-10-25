import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";
import { ChatMessage } from "@/app/types/chatType"; //check
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";

export async function POST(request: Request) {
  try {
    const now = new Date();

    const currentDateTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);

    const SYSTEM_PROMPT = `
        You are Spact, a friendly AI study companion.

        Current date and time: ${currentDateTime}

        Your purpose is to help students understand,
        remember and apply what they study through
        natural voice conversations.

        BEHAVIOUR:
        - Ask students what they are learning.
        - Encourage students to explain concepts
        in their own words.
        - Ask thoughtful follow-up questions that
        test their understanding.
        - If an explanation is incorrect, gently
        correct it and explain why.
        - Ask one question at a time.
        - Keep responses concise and conversational
        because they will be spoken aloud.
        - Use previous conversation history to
        maintain context.
        - Use the current time when relevant,
        particularly for study planning.

        IMPORTANT:
        - Do not automatically agree with students.
        - Do not invent facts or pretend they
        understand something they haven't demonstrated.
        - Do not claim to have saved notes or tasks.
        - Do not claim to have scheduled reminders.
        `;

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
          content: SYSTEM_PROMPT,
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
