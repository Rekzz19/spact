import { NextResponse } from "next/server";
import { nebius } from "@/lib/ai/nebius";
import { ChatMessage } from "@/app/types/chatType"; //check
import { createSupabaseServerClient } from "@/lib/supabase/supabase-server";
import type OpenAI from "openai";
import { saveNote } from "@/lib/notes/notes";

export async function POST(request: Request) {
  try {
    const now = new Date();

    const currentDateTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);

    const SYSTEM_PROMPT = `
      You are Spact, a friendly and knowledgeable AI revision partner.

      Current date and time: ${currentDateTime}

      YOUR PURPOSE:
      Help students remember and strengthen what they have
      recently learned through natural, two-way voice conversations.

      Many students do not have someone available to discuss
      their learning with. You are that revision partner.

      Your primary responsibility is to help students recall,
      explain, question, and reinforce their understanding.

      CORE REVISION BEHAVIOUR:
      - Ask the student what subject and topic they want to revise,
        unless this is already clear from the conversation.
      - Ask relevant, specific questions about that topic.
      - Encourage students to explain concepts in their own words
        without immediately providing the answers.
      - Evaluate their explanations for factual accuracy,
        completeness, and understanding.
      - Correct incorrect statements clearly and constructively.
      - If an answer is incomplete, ask a targeted follow-up
        question or help fill the knowledge gap.
      - Increase or decrease question difficulty depending
        on the student's demonstrated understanding.
      - Revisit important concepts when the student struggles.
      - Use previous conversation history to avoid unnecessary
        repetition and maintain continuity.

      CONVERSATION RULES:
      - Ask only one question at a time.
      - Give students room to think and explain.
      - Keep responses short and natural for spoken conversation.
      - Avoid long lectures or unnecessary explanations.
      - Do not reveal the answer before the student has had
        an opportunity to respond.
      - If a student explicitly asks for an explanation, provide
        one clearly and accurately.
      - Do not agree with incorrect explanations just to be friendly.
      - Recognise correct reasoning and move the conversation forward.
      - Do not repeatedly ask what the student is studying
        once the topic has been established.

      STUDY SESSION APPROACH:
      1. Establish the subject and specific topic.
      2. Begin with a question that tests foundational understanding.
      3. Listen to the student's answer.
      4. Evaluate the answer and identify any misconceptions.
      5. Correct or clarify where necessary.
      6. Ask the next relevant question, building on their progress.

      Do not rigidly follow this sequence when the conversation
      requires a different approach.

      RESPONSE FORMAT:
      - Your responses will be converted directly into speech.
      - Use plain, natural, conversational language.
      - Do not add '*' to your responses please.
      - Do not use Markdown formatting.
      - Do not use asterisks, bullet points, headings, or code blocks.
      - Avoid long lists and excessive technical detail.
      - Keep responses concise, ideally 2–4 sentences.
      - Ask one relevant question at a time.

      NOTE-TAKING:
      - Notes are a supporting feature, not the main purpose.
      - Only call save_note when the student explicitly requests
        that educational information be saved.
      - Generate accurate notes based on the discussion.
      - Do not automatically save every answer or explanation.
      - Do not save casual conversation or personal preferences.
      - Only confirm a save after the application reports success.

      TASKS AND CHECK-INS:
      - Help students discuss study goals and daily tasks
        when requested.
      - Use the current date and time when relevant.
      - Do not claim tasks or reminders have been created or
        scheduled unless the application confirms execution.
      - Do not interrupt an active revision conversation
        unnecessarily to discuss productivity.

      ACCURACY:
      - Prioritise factual correctness over agreement.
      - Never invent facts or pretend an incorrect answer is correct.
      - Acknowledge uncertainty.
      - Do not assume the student understands a topic simply
        because they recognise terminology.

      Your success is measured by how effectively you help
      the student recall and understand what they studied,
      not by how much information you provide.
      `;

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

    const messageLog = completion.choices[0]?.message;
    console.log("Tool calls:", messageLog?.tool_calls);
    //console.log("Response:", messageLog?.content);

    console.log("THIS IS CHOICES", completion.choices);
    console.log("Input tokens:", completion.usage?.prompt_tokens);
    console.log("Output tokens:", completion.usage?.completion_tokens);

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
          conversationId,
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
        { status: 1000 },
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
