# All-in-One Assistant Bot — Bot specification

**Archetype:** custom

**Voice:** helpful and concise — write every user-facing message, button label, error, and empty state in this voice.

A public Telegram bot that answers questions, generates images from prompts, creates text documents and exports PDFs, and produces summaries/notes — delivering completed items directly in chat as attachments. It supports both natural chat and explicit commands.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- General public
- Casual users
- Creatives
- Anyone needing documents or PDF exports

## Success criteria

- Users receive requested outputs (images, documents, PDFs, summaries) directly in chat as attachments
- Bot handles both natural chat and explicit commands effectively
- Minimal user data is stored and purged after 30 days

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **/ask** (command, actor: user, command: /ask) — Ask a question and receive an answer
  - inputs: question
  - outputs: answer
- **/image** (command, actor: user, command: /image) — Generate an image from a prompt
  - inputs: prompt
  - outputs: image
- **/doc** (command, actor: user, command: /doc) — Create a text document
  - inputs: brief
  - outputs: document
- **/pdf** (command, actor: user, command: /pdf) — Export a document as PDF
  - inputs: doc-id or text
  - outputs: PDF
- **/summary** (command, actor: user, command: /summary) — Generate a summary of a message or text
  - inputs: message-id or text
  - outputs: summary

## Flows

### Natural Chat Flow
_Trigger:_ user message

1. User types a question or request
2. Bot replies or asks a clarifying question if needed
3. Bot delivers the requested output as an attachment

_Data touched:_ Conversation, Request, Asset

### Command Flow
_Trigger:_ command

1. User enters a command with parameters
2. Bot processes the command
3. Bot delivers the requested output as an attachment

_Data touched:_ Request, Asset

### Clarification Flow
_Trigger:_ ambiguous request

1. Bot detects an ambiguous request
2. Bot asks a brief clarifying question
3. User provides clarification
4. Bot generates the requested output

_Data touched:_ Conversation, Request, Asset

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram account information
  - fields: Telegram ID, Language preference
- **Conversation** _(retention: persistent)_ — Chat history per user
  - fields: Message history (last 30 messages)
- **Request** _(retention: session)_ — User request for Q&A, image, document, or summary
  - fields: Request type, Timestamp, Parameters
- **Asset** _(retention: persistent)_ — Generated image, document, or PDF
  - fields: Asset type, Timestamp, Size, Download link

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Rate limiting configuration
- Content safety filtering rules
- File retention period (currently 30 days)

## Notifications

- Progress messages for long tasks
- Completion notifications with file attachments

## Permissions & privacy

- Minimal data storage: conversation history (last 30 messages) and asset metadata for 30 days
- No long-term profiling or personal data collection
- Content safety filtering for illegal or dangerous requests

## Edge cases

- Ambiguous user requests requiring clarification
- Rate limit exceeded scenarios
- Content safety filtering triggers
- File download requests for expired assets

## Required tests

- Verify that users receive requested outputs as attachments in chat
- Test command handling for all supported commands
- Validate data retention and purging after 30 days
- Test content safety filtering for illegal/dangerous requests

## Assumptions

- Public access for all users
- Rate limiting is applied silently to prevent abuse
- DOCX and PDF formats cover most user needs
- Image outputs use standard JPEG/PNG formats
- Summaries support length customization
- Clarifications are limited to one brief question per request
- File retention is 30 days
- Content safety filtering is applied for public deployment
- Primary language is English with best-effort support for other languages
