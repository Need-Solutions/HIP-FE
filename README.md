# HIP – Hikers Integrated Platform (frontend)

React + TypeScript + Tailwind CSS starter for HIP. It includes all routes and layouts, the design tokens from Figma, a mock API layer, and the offline check-in foundation. The landing page is fully built. Every other screen is a placeholder that names its Figma frame and SRS requirements.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. In dev mode with mocks on, you can open `/account`, `/checkin` and `/admin` without logging in.

## Test on a phone

Phones only allow the camera over HTTPS, so the check-in scanner needs the phone mode:

```bash
npm run dev:phone
```

1. Connect the phone to the same Wi-Fi as this computer.
2. Open the `https://…:5173/checkin` address printed in the terminal.
3. Accept the certificate warning. It's a local, self-signed certificate made for development.
4. Log in as check-in staff (`tola@hip.ng`, password `Hiking123!`, code `123456`) and allow the camera when asked.

This mode is for development only; production is served over real HTTPS.

## Continuing in VS Code with Claude Code

Open this folder in VS Code and start Claude Code. It reads `CLAUDE.md`, which has the stack, conventions, business rules, the offline check-in design, the proposed API contract and a screen-by-screen build checklist. For example, ask it: "Build the Events page from the Figma frame Web / Events."
