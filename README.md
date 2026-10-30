# Spact

**Say it. Remember it.**

Spact is a voice-first AI revision partner that helps students recall and strengthen what they have learned through conversation. Rather than simply providing answers, Spact asks relevant questions, listens to explanations, identifies misconceptions and offers constructive feedback.

Built for the **Nebius Global AI Hackathon 2026**.

## The problem

Students often finish a lesson or study session without someone to discuss the material with. Spact provides a conversational revision partner that encourages students to explain concepts in their own words and actively retrieve information.

## Features

- **Voice-first revision:** Speak about any subject or topic and receive spoken AI responses.
- **Question-led learning:** Spact asks follow-up questions, evaluates explanations and challenges misconceptions.
- **Conversation history:** Revision messages are stored in Supabase and can be restored during an active session.
- **Revision sessions:** A new conversation can begin after 90 minutes of inactivity; previous conversations remain in the database.
- **AI-assisted notes:** Students can ask Spact to save study notes from their discussions and view saved notes in the app.
- **Guest and registered accounts:** Students can begin anonymously and later register with email verification and a password while preserving their account data.

## Tech stack

| Layer                       | Technology                                               |
| --------------------------- | -------------------------------------------------------- |
| Frontend and backend        | Next.js App Router, React, TypeScript, Tailwind CSS      |
| Speech-to-text              | Deepgram                                                 |
| AI                          | NVIDIA Nemotron 3.5 Lightning via Nebius Token Factory   |
| Database and authentication | Supabase (PostgreSQL, Supabase Auth, Row Level Security) |
| Speech output               | Text-to-speech integration                               |
| Deployment                  | Vercel                                                   |

## How it works

Student speaks → Browser records audio → Deepgram transcribes speech → Next.js retrieves conversation history → NVIDIA Nemotron generates a response via Nebius Token Factory → Response is displayed and converted to speech.

When the AI requests the `save_note` tool, the Next.js backend handles the database operation through Supabase.

Spact sends the model its revision instructions, the student's latest transcript and recent messages from the current conversation. The model can respond conversationally or request a supported tool. The backend is responsible for executing database operations, not the model itself.

## Running locally

### Prerequisites

- Node.js and npm (use a version supported by the repository's `package.json`)
- A Supabase project with the required schema and authentication configuration
- Deepgram and Nebius API credentials
- Any credentials required by the configured text-to-speech provider

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root.

The following variable names reflect the application's server-side configuration discussed during development. Check the codebase for the exact names and any additional TTS or public-client variables before running.

```dotenv
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
NEBIUS_API_KEY=your_nebius_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

Never commit `.env.local` or expose private API keys through `NEXT_PUBLIC_` variables.

### 3. Configure Supabase

Set up the authentication flow and database tables used by the application, including `conversations`, `messages` and `notes`.

Enable and configure Row Level Security so users only access their own data.

Add appropriate local and production URLs to Supabase Auth's redirect allowlist for email verification and password setup.

If the repository contains migrations or SQL setup scripts, run those rather than manually recreating the schema.

### 4. Start the application

```bash
npm run dev
```

Open `http://localhost:3000`.

To verify a production build locally:

```bash
npm run build
```

## Authentication and data

Spact uses Supabase Auth to manage anonymous and registered sessions.

Students can upgrade an anonymous account by verifying an email and setting a password.

Conversation and note records are associated with the authenticated user. PostgreSQL Row Level Security provides database-level access controls.

## Deployment

Spact is deployed with Vercel.

Configure the production environment variables in Vercel and update Supabase Auth's site URL and allowed redirect URLs to match the deployed domain.

The application calls Nebius Token Factory for model inference; the frontend and API routes run on Vercel.

## Current scope

Spact focuses on conversational revision, session history and study notes.

It currently uses a recorded-audio transcription flow rather than full-duplex real-time streaming.

Further improvements being explored include lower voice latency, stronger note-action safeguards and more personalised revision context.

## Acknowledgements

Built using **Nebius Token Factory**, **NVIDIA Nemotron**, **Deepgram**, **Supabase**, **Next.js** and **Vercel**.
