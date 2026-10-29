import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import type OpenAI from "openai";
import { saveNote } from "@/lib/notes/notes";
import {
  ConversationError,
  resolveActiveConversation,
} from "@/lib/conversations/conversations";

export async function POST(request: Request) {
  try {
    const now = new Date();

    const currentDateTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);

    const SYSTEM_PROMPT = buildSystemPrompt(currentDateTime);

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "save_note",
          description:
            "Save educational study notes ONLY when the student " +
            "explicitly requests that notes be saved. " +
            "Do not use this tool for casual conversation, " +
            "personal preferences, or general statements about studying.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "A concise title for the study note",
              },
              content: {
                type: "string",
                description:
                  "The accurate study notes to save, based on " +
                  "the conversation.",
              },
            },
            required: ["title", "content"],
            additionalProperties: false,
          },
        },
      },
    ];

    const { transcript, conversationId } = await request.json();

    if (
      typeof transcript !== "string" ||
      !transcript.trim() ||
      transcript.length > 5000 || //checks around the transcript length
      (conversationId != null && typeof conversationId !== "string")
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

    const activeConversationId = await resolveActiveConversation(
      supabase,
      user.id,
      conversationId,
    );

    const { data: messages, error: historyError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", activeConversationId)
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

    console.log("Sending system prompt: revision-v2");
    console.log("System prompt:", SYSTEM_PROMPT);

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
      tools,
      tool_choice: "auto",
      max_tokens: 500,
      // Nebius-specific option passed through the OpenAI-compatible SDK.
      ...{
        chat_template_kwargs: {
          enable_thinking: false,
        },
      },
    });

    //---->DEBUG<---//
    console.log("The Model returned:", completion.model);
    const models = await nebius.models.list();
    console.log(models.data.map((model) => model.id));
    const messageLog = completion.choices[0]?.message;
    console.log("Tool calls:", messageLog?.tool_calls);
    console.log("Input tokens:", completion.usage?.prompt_tokens);
    console.log("Output tokens:", completion.usage?.completion_tokens);

    //---->DEBUG<----//

    const choice = completion.choices[0];
    const message = choice?.message;

    if (!message) {
      throw new Error("Nebius returned no message");
    }

    let reply = message.content; //response for no tool calling
    if (message.tool_calls?.length) {
      // Only handle the save_note tool for now
      const toolCall = message.tool_calls.find(
        (call) =>
          call.type === "function" && call.function.name === "save_note",
      );

      if (!toolCall || toolCall.type !== "function") {
        throw new Error("Unsupported tool call");
      }

      try {
        const args: unknown = JSON.parse(toolCall.function.arguments);

        if (
          typeof args !== "object" ||
          args === null ||
          !("title" in args) ||
          !("content" in args)
        ) {
          throw new Error("Invalid tool arguments");
        }

        const { title, content } = args;

        // user comes from your existing getUser() call
        const note = await saveNote({
          supabase,
          userId: user.id,
          title: title as string,
          content: content as string,
          conversationId: activeConversationId,
        });

        reply = `I've saved your note titled ${note.title}.`;
      } catch (error) {
        console.error("Save note tool failed:", error);
        reply = "Sorry, I couldn't save that note. Please try again.";
      }
    }

    // Enforce the spoken response format even if the model adds Markdown.
    reply = reply?.replace(/\*/g, "").trim() ?? null;

    if (!reply) {
      throw new Error("Nebius returned no text or tool call");
    }

    //save the message transcript and response
    const { error: saveError } = await supabase.from("messages").insert([
      {
        conversation_id: activeConversationId,
        role: "user",
        content: transcript,
      },
      {
        conversation_id: activeConversationId,
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
    return NextResponse.json({
      reply,
      conversationId: activeConversationId,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof ConversationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Nebius request failed:", error);

    return NextResponse.json(
      { error: "Could not generate an AI response" },
      { status: 502 },
    );
  }
}
