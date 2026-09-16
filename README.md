# ROW Guild Manager

A responsive Ragnarok: The New World guild roster and battlefield team planner.

## Run locally

```bash
npm install
npm run dev
```

## Firebase setup

1. Create a Firebase web app and enable Firestore plus Google as a Firebase Authentication provider.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
3. Deploy Firestore rules appropriate for your guild. Client-side role controls are deliberately a UI convenience; enforce Guild Master, Officer, and Member permissions with Firestore Security Rules in production.

The project works without Firebase configured, storing roster and teams in browser local storage for development.

## CSV imports

The importer supports both the requested names (`Player Name / IGN`, `Level`, `Guild Position`) and the supplied guild-export names (`Player`, `Lv.`, `Position`). It validates an IGN, ignores blank rows, and skips duplicate IGNs.
