# VoiceMux Bridge - System Architecture & Design

## 1. Project Identity & Core Philosophy
**VoiceMux Bridge** is a Chrome extension that serves as a secure bridge between a mobile device (voice/text input) and desktop web-based AI agents (Gemini, ChatGPT, Claude, etc.).

- **Core Value:** Enable seamless voice input on desktop AI interfaces using the superior voice recognition capabilities of mobile devices.
- **Privacy First:** Strictly adheres to Client-Side End-to-End Encryption (E2EE). The server is a dumb pipe; keys never leave the client.
- **Universal Compatibility:** Works on *any* website via customizable adapters and smart fallback logic.

## 2. System Architecture

### Components
1.  **Mobile Client (Sender):** Captures voice/text and sends encrypted data via WebSocket.
2.  **Relay Server (Phoenix/Elixir):** Broadcasts encrypted messages between peers in a "Room". Does not store data.
3.  **Chrome Extension (Receiver):**
    - **Background Script (`background.js`):** Manages WebSocket connection, keeps alive, and handles E2EE decryption keys.
    - **Content Script (`content.js`):** Injects decrypted text into the target website's input field.
    - **Popup (`popup.html/js`):** Generates the QR code for pairing (containing Room ID + Key).

### Data Flow
1.  **Pairing:** User scans QR code. URL fragment contains `RoomID` and `AES-Key`.
2.  **Input:** User speaks/types on mobile.
3.  **Encryption:** Mobile encrypts text using `AES-GCM 256-bit` with the shared key.
4.  **Transmission:** Encrypted payload is sent to Relay Server via WebSocket.
5.  **Relay:** Server broadcasts payload to the Extension (joined to same Room).
6.  **Decryption:** Extension receives payload, decrypts it using the local key.
7.  **Injection:** `content.js` identifies the active input field and injects the text.

## 3. Security Model (E2EE)
- **Algorithm:** AES-GCM (256-bit).
- **Key Generation:** Generated locally in `background.js` using `crypto.subtle`.
- **Key Storage:** `chrome.storage.local` (Browser internal storage).
- **Key Exchange:** Via URL Hash Fragment (`#key=...`). The hash is never sent to the server in a standard HTTP request.
- **Trust Boundary:** The server is untrusted. It only sees encrypted blobs (`ciphertext`, `iv`).

## 4. Key Files & Directories
- `manifest.json`: Extension configuration (Manifest V3).
- `background.js`: WebSocket & Key management.
- `content.js`: DOM manipulation & Adapter logic.
- `adapters.json`: Built-in site adapters.
- `docs/`: Project documentation (AGENTS, PROGRESS, ADRs).
