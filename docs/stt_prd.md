# Product Requirements Document (PRD)

## Title

Persistent Browser-to-Backend Voice Streaming for Real-Time Speech-to-Text

## Goal

Build a web-based voice input system that supports a persistent, low-latency audio session between browser and backend. The system should continuously stream microphone audio from the browser to the backend, detect utterance boundaries based on speech activity and pauses, generate real-time and final speech-to-text transcripts, and support repeated conversational turns in a single long-lived session.

This PRD is intended for implementation by an AI coding agent.

---

## 1. Problem Statement

Traditional voice input on the web is usually implemented as push-to-talk or record-then-upload. That interaction model is not suitable for conversational systems where the user may:

* speak continuously,
* pause briefly,
* wait for a response,
* speak again,
* repeat this cycle many times in the same session.

We need a persistent streaming architecture where the browser microphone remains active, audio is continuously transmitted to the backend, and the backend is responsible for detecting speech segments, finalizing utterances, and returning transcript events in real time.

---

## 2. Product Objectives

### Primary Objective

Enable a browser client to continuously stream audio to the backend for real-time speech-to-text processing in a persistent session.

### Secondary Objectives

* Support partial and final transcripts.
* Support automatic utterance segmentation based on silence / VAD.
* Support repeated turns in a single session without reconnecting or restarting microphone capture.
* Provide a clean protocol that can later be extended for LLM responses, TTS, interruption, and barge-in.

### Non-Goals (for v1)

* Full text-to-speech playback.
* End-to-end voice agent orchestration.
* Speaker diarization.
* Multi-user conferencing.
* Audio recording archive / playback UI.
* Perfect noise suppression beyond what browser / OS already provides.

---

## 3. Target User / Use Cases

### Target User

Developers building a conversational web application that requires continuous voice input.

### Primary Use Cases

1. User opens a web page and grants microphone access.
2. The browser opens one long-lived streaming session to the backend.
3. The user starts speaking.
4. The browser continuously uploads audio chunks.
5. The backend detects voice activity and produces partial transcript updates.
6. The user pauses long enough for the backend to finalize the utterance.
7. The backend sends a final transcript event.
8. The user speaks again in the same session.
9. Steps 4-8 repeat without restarting the microphone or reconnecting.

### Future Use Cases

* Feed final transcript into an LLM.
* Stream assistant responses back to the browser.
* Interrupt assistant output when user starts speaking again.

---

## 4. Product Scope

### In Scope

* Browser microphone capture.
* Continuous audio chunk generation.
* Audio streaming from browser to backend over persistent connection.
* Session lifecycle management.
* Server-side utterance segmentation.
* Real-time speech-to-text integration.
* Partial and final transcript events.
* Minimal frontend demo UI for transcript visualization and session state.

### Out of Scope

* Authentication / production-grade account system.
* Billing.
* Mobile native apps.
* Offline mode.
* Multi-tab synchronization.

---

## 5. Functional Requirements

### FR-1: Persistent Session

The system must create a long-lived voice session between browser and backend.

Requirements:

* Browser establishes a persistent connection when the user starts voice mode.
* Session remains active across multiple user utterances.
* Microphone capture must not restart between utterances.
* Backend must maintain per-session state.

### FR-2: Continuous Audio Capture

The browser must continuously capture microphone audio while voice mode is active.

Requirements:

* Use browser microphone APIs.
* Audio should be captured in near-real-time.
* The frontend should emit audio chunks at a configurable interval.
* Target chunk cadence: 20ms to 100ms, with 50ms as the default target.

### FR-3: Audio Streaming to Backend

The browser must stream audio chunks to the backend continuously.

Requirements:

* Use a persistent bidirectional transport.
* Preferred transport: WebSocket.
* Audio frames should be sent as binary data, not JSON-encoded sample arrays.
* The protocol must include session start and end control messages.

### FR-4: Backend Session State

The backend must track state for each active voice session.

Per-session state should include at minimum:

* session id,
* connection status,
* audio format metadata,
* current speech buffer,
* last voice activity timestamp,
* current speech / silence state,
* transcript history for the session.

### FR-5: Utterance Segmentation

The backend must determine when a user utterance begins and ends.

Requirements:

* Use server-side VAD and/or silence timeout logic.
* Short pauses should not automatically end an utterance.
* Longer silence should finalize the current utterance.
* The segmentation logic must be configurable.

Default thresholds for v1:

* chunk interval target: 50ms,
* silence timeout to finalize utterance: 800ms,
* minimum speech duration: 300ms,
* maximum utterance duration: 15s.

### FR-6: Streaming STT

The backend must process incoming audio through a speech-to-text service or engine.

Requirements:

* Support at least one real-time STT provider.
* Prefer an abstraction layer so provider can be swapped.
* Backend should emit partial transcript updates when available.
* Backend should emit final transcript event once utterance is finalized.

### FR-7: Frontend Transcript Updates

The frontend must display transcript events in near-real-time.

Requirements:

* Show partial transcript while the user is speaking.
* Replace or append with final transcript once finalized.
* Maintain transcript history for the session.

### FR-8: Session Lifecycle Controls

The frontend must support explicit session start and stop.

Requirements:

* User can start voice mode.
* User can stop voice mode.
* On stop, frontend must stop audio capture and notify backend.
* Backend must clean up resources for closed sessions.

### FR-9: Error Handling

The system must handle common failure cases gracefully.

Requirements:

* Microphone permission denied.
* WebSocket disconnect.
* STT provider failure.
* Invalid audio format.
* Session timeout or backend cleanup.
* UI must surface actionable status to developer or user.

---

## 6. Non-Functional Requirements

### NFR-1: Latency

* Partial transcripts should typically appear within 300-800ms from speech input under normal conditions.
* Final transcript after utterance end should typically appear within 500-1500ms depending on provider and network.

### NFR-2: Reliability

* Session should survive multiple consecutive utterances without reconnecting.
* Backend should avoid memory leaks from unbounded audio buffering.

### NFR-3: Extensibility

The design should allow later extension for:

* LLM response generation,
* TTS streaming,
* interruption / barge-in,
* multiple STT providers,
* analytics and logging.

### NFR-4: Observability

The system should log:

* session start / end,
* utterance start / end,
* chunk counts,
* provider errors,
* transcript timing,
* disconnect reasons.

### NFR-5: Security

* Do not expose provider secrets in the browser.
* STT provider integration must happen server-side.
* Validate connection and payload sizes.
* Limit session duration and idle time.

---

## 7. Technical Architecture

## 7.1 High-Level Flow

1. Browser requests microphone access.
2. Browser creates persistent WebSocket connection to backend.
3. Browser continuously captures audio and sends binary chunks.
4. Backend receives audio and appends to session buffer.
5. Backend runs VAD / silence detection.
6. Backend forwards audio to STT engine/provider.
7. Backend emits transcript.partial and transcript.final events.
8. Browser updates UI.
9. Session remains active for the next utterance.

## 7.2 Frontend Responsibilities

* Acquire microphone input.
* Capture audio continuously.
* Convert to transportable chunk format.
* Send control events and binary audio frames.
* Render transcript and session status.

## 7.3 Backend Responsibilities

* Accept persistent client connection.
* Track per-session state.
* Validate control messages and audio payloads.
* Run utterance segmentation.
* Connect to STT provider.
* Stream transcript events back to client.
* Clean up idle or closed sessions.

---

## 8. Audio and Transport Requirements

### Preferred Input Format

Preferred logical format for backend processing:

* mono,
* 16-bit PCM,
* 16kHz.

Notes:

* Browser-native capture sample rate may differ (often 48kHz).
* Resampling may happen on frontend or backend.
* v1 may allow browser-native sample rate as long as backend can normalize it.

### Preferred Browser Capture Strategy

Preferred frontend strategy:

* `getUserMedia` for microphone access,
* `AudioContext` + `AudioWorklet` for low-latency streaming.

Fallback allowed for prototype only:

* `MediaRecorder`, if implementation speed is prioritized over latency.

### Preferred Transport

* WebSocket.

Rationale:

* persistent full-duplex channel,
* binary audio streaming,
* server-to-client transcript events,
* simpler than polling.

---

## 9. Event Protocol

The protocol should be simple, explicit, and extensible.

### Client → Server Control Messages

```json
{ "type": "session.start", "sessionId": "uuid", "format": "pcm_s16le", "sampleRate": 16000, "channels": 1 }
```

```json
{ "type": "session.end", "sessionId": "uuid" }
```

### Client → Server Audio Payloads

* Binary audio frames only.
* Each binary frame corresponds to one chunk of PCM audio.

### Server → Client Events

```json
{ "type": "session.ready", "sessionId": "uuid" }
```

```json
{ "type": "speech.start", "sessionId": "uuid", "timestamp": 1234567890 }
```

```json
{ "type": "transcript.partial", "sessionId": "uuid", "utteranceId": "u1", "text": "hello wor" }
```

```json
{ "type": "transcript.final", "sessionId": "uuid", "utteranceId": "u1", "text": "hello world" }
```

```json
{ "type": "speech.end", "sessionId": "uuid", "utteranceId": "u1", "timestamp": 1234567999 }
```

```json
{ "type": "error", "sessionId": "uuid", "code": "PROVIDER_ERROR", "message": "..." }
```

### Protocol Notes

* `sessionId` should be consistent for the life of the connection/session.
* `utteranceId` should increment per finalized segment.
* The protocol should be versionable later.

---

## 10. Backend Provider Abstraction

The implementation should not hardcode business logic to a single STT provider.

Create an internal STT adapter interface such as:

* initialize session,
* send audio chunk,
* receive partial transcript,
* finalize utterance,
* close session.

Initial implementation may support one provider only, but architecture should allow future providers such as:

* OpenAI realtime transcription,
* Deepgram,
* AssemblyAI,
* Google Speech-to-Text,
* Azure Speech.

---

## 11. Suggested Internal State Machine

Recommended backend state model per session:

* `LISTENING`
* `IN_SPEECH`
* `WAITING_FOR_FINAL_SILENCE`
* `PROCESSING`
* `CLOSED`

Expected behavior:

* On first detected voice activity, move from `LISTENING` to `IN_SPEECH`.
* While voice continues, keep buffering and streaming.
* On silence, move to `WAITING_FOR_FINAL_SILENCE`.
* If voice resumes quickly, return to `IN_SPEECH`.
* If silence exceeds threshold, finalize utterance and move to `PROCESSING`.
* After final transcript is emitted, return to `LISTENING`.

---

## 12. Frontend Demo Requirements

The AI agent should deliver a minimal browser demo UI.

Demo UI requirements:

* Start button.
* Stop button.
* Connection status indicator.
* Speaking / idle status indicator.
* Partial transcript area.
* Final transcript history list.
* Error area.

The UI does not need production styling. Functional clarity is more important than appearance.

---

## 13. API / Module Structure Expectations

The implementation should be organized into clear modules.

### Suggested Frontend Modules

* `mic-capture`
* `audio-worklet-processor`
* `ws-client`
* `voice-session-store`
* `transcript-view`

### Suggested Backend Modules

* `session-manager`
* `audio-ingest`
* `vad-segmenter`
* `stt-adapter`
* `transcript-event-publisher`
* `ws-server`

The final structure may differ, but responsibilities should remain clearly separated.

---

## 14. Acceptance Criteria

A build is acceptable for v1 if all of the following are true:

1. A user can open the web page and start a voice session.
2. The browser captures microphone audio continuously without restarting between utterances.
3. Audio is continuously streamed to the backend over one persistent connection.
4. The backend detects at least two separate utterances in one session when the user speaks, pauses, then speaks again.
5. The frontend receives and displays at least one partial transcript during speech.
6. The frontend receives and displays final transcript events after utterance finalization.
7. The session can be stopped cleanly by the user.
8. Disconnects and errors are surfaced in the UI and logs.

---

## 15. Nice-to-Have Enhancements (Not Required for v1)

* Configurable silence threshold from UI.
* Visual microphone level meter.
* Ring buffer for pre-speech capture.
* Interrupt / barge-in primitives.
* Transcript timestamps.
* Session replay logs for debugging.
* Pluggable VAD engine.
* Multi-provider STT comparison mode.

---

## 16. Implementation Notes for AI Agent

### Required Deliverables

The AI agent should produce:

1. a working frontend browser demo,
2. a working backend service,
3. clear setup instructions,
4. environment variable documentation,
5. a short architecture README.

### Engineering Preferences

* Prefer TypeScript for both frontend and backend.
* Prefer clear module boundaries over clever abstractions.
* Prefer minimal but readable code.
* Avoid unnecessary framework complexity.
* Design for local development first.

### Suggested Stack

* Frontend: browser app with TypeScript.
* Backend: Node.js + TypeScript.
* Transport: WebSocket.
* Audio capture: AudioWorklet preferred.
* STT provider: one initial provider behind adapter interface.

### Important Constraints

* Do not send provider API keys to the client.
* Do not tightly couple utterance segmentation logic to the UI.
* Do not require reconnecting between utterances.
* Do not rely on push-to-talk interaction.

---

## 17. Open Questions

The AI agent may choose sensible defaults where unspecified, but should document decisions for:

* frontend resampling vs backend resampling,
* which STT provider is implemented first,
* exact VAD implementation method,
* how partial transcripts are merged in UI,
* session timeout policy.

---

## 18. Summary

Build a persistent browser-to-backend voice streaming system for real-time speech-to-text. The browser should continuously stream microphone audio over a long-lived connection. The backend should own session state, voice activity detection, utterance segmentation, and STT integration. The system should support repeated conversational turns in one session and provide partial and final transcript events to the frontend in real time.
