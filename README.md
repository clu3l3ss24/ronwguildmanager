# RONW Guild Manager

A responsive Ragnarok: The New World guild roster and battlefield team planner.

## Run locally

```bash
npm install
npm run dev
```

## Firebase setup

1. Create a Firebase web app and a Cloud Firestore database.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
3. In Firebase Authentication → Sign-in method, enable **Email/Password** for leaders and **Anonymous** for member-token sessions. Members do not enter an email/password; Anonymous authentication gives their browser a Firebase identity while Firestore validates their guild token. Google sign-in is not used.
4. In Authentication → Settings → Authorized domains, add your app's hostname (and `localhost` for local development if it is absent).
5. Deploy the included `firestore.rules` before using the app online. With Firebase CLI installed, run `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID` from this directory. Alternatively paste `firestore.rules` into the Firestore Rules editor and publish it.
6. Restart the Vite server after changing `.env`.

Without Firebase configured, account creation is disabled and **Explore local demo** opens browser-only storage. Demo data is never automatically uploaded into a real account.

## Accounts and separate guilds

The initial screen opens to account sign-in, with a **Sign up** link below and a **Member token** option. Leaders create an account using email and password, then name their guild. Returning leaders sign in to their existing guild. Users can request a password reset link. This phase supports one guild per leader and token sessions with full guild-management access for members; individual member profiles and officer roles are not implemented yet.

- **Firebase Authentication** stores account credentials and assigns a stable user ID. Passwords are passed directly to Firebase Authentication; the app does not write them to Firestore or local storage.
- **Cloud Firestore** stores the user's profile and their guild data:

```text
users/{uid}                         → guildId, displayName, createdAt
guilds/{uid}                        → name, ownerId, createdAt, teams
guilds/{uid}/members/{memberId}      → imported roster records
guilds/{uid}/savedTeams/{formationId} → formation records
memberTokens/{sha256Digest}           → guildId, ownerId, name, createdAt, expiresAt
memberSessions/{anonymousUid}         → guildId, tokenHash, joinedAt
```

The guild ID currently equals its leader's Firebase user ID. The profile and guild are created together in a batch. If account creation succeeds but onboarding is interrupted, signing in again resumes guild creation. The included rules grant guild-management access to the authenticated owner and to sessions backed by a valid token for that guild. The UI does not provide a role selector.

### Member login tokens

On the **Command** page, only account-based guild leaders can view, create, copy, or revoke member login tokens. Tokens expire after 1, 7, or 30 days. Each list row has **Copy token** for retrieving a token again. Older hash-only tokens cannot be recovered: create a replacement and revoke the old token.

Login continues to use a SHA-256 digest. Recoverable copies of new tokens are stored separately at `guilds/{guildId}/tokenSecrets/{digest}`, protected by owner-only Firestore rules; they are never included in the token login lookup. Token sessions retain roster and formation access but cannot list tokens or read their recoverable values, create tokens, or revoke tokens. Expiry and revocation still apply. Publish the updated `firestore.rules` before using this feature. Do not put tokens in URLs or browser storage.

Revoking a token deletes its registry entry and invalidates every session using it. Rules check validity and expiry on subsequent reads and writes; the app watches revocation and closes the workspace at expiry. This cannot erase information a member has already viewed or copied. Members can sign out or enter a new token after expiry/revocation. Signing out does not delete their temporary Firebase identity.

**When updating an existing deployment:** publish the new `firestore.rules` and enable the Anonymous provider before testing member access. Existing leader accounts and guild data stay in place.

Signing out clears the mounted workspace. Signing in as another account loads that account's guild without copying browser demo data or another guild's roster. Opening the app only reads the current formation; it does not save an empty startup board. Formation parties are serialized as objects containing slot arrays for Firestore compatibility.

### Saved formations and Undo

The Team Builder supports three battle modes: **Guild League** (up to 60 players / 12 five-person parties), **Polarity Zone** (up to 50 players / 10 five-person parties), and **Siege** (open team count). Manual party creation and auto-balance follow the selected player/party limit; Siege has no player limit; auto-balance fills only existing party slots. Switching to a smaller mode asks before removing excess parties and returns their players to Available Members. Undo can restore the previous mode and teams.

The battlefield starts empty, with no fixed lanes. Create a named team using **Add team**, then use **Add party** inside that team. Teams can have any number of five-person parties within the overall mode limit. Both team and party names are editable directly on their cards; press Enter or leave the field to save it. Custom teams, party names, and battle mode are included in shared saved formations, board sync, and Undo/Redo. Existing populated lane saves are converted to editable teams; empty default lanes are omitted. Auto-balance fills only empty slots in the parties you have created. Assigned players, team names, party names, and the number of parties stay unchanged. It selects unassigned players by gear score using the five-slot preferences chosen in the Auto-balance popup, and stops when the available slots or matching players run out. The roster source is always sorted by highest gear score first, including after filtering. Its **Member status** filter defaults to **All statuses** and supports **Online** or **Offline**. Auto-balance fills open slots only with unassigned members matching that status; already assigned members stay in place even if their status differs. Search and class filters continue to control the displayed roster. Mode and names are stored inside the existing Firestore `teams` map, so this addition needs no new rules changes beyond the already required Save/Undo rules.

The Team Builder playbook is shared within the guild. **Save formation** opens a naming window and creates a new save slot. Guild League requires all 12 parties filled (60 distinct current roster members), and Polarity Zone requires all 10 parties filled (50 members), before a named save is allowed. Incomplete attempts show the remaining party and player counts. Siege saves can have any formation size. The active board still saves automatically while you build, even before a named formation is complete.

**Load formation** opens a modal slot picker, keeping the save list off the main board. Select a slot, then choose **Load selected** to restore its battle mode, teams, parties, names, and assignments. The popup also supports deleting a selected save without changing the active board. Cancel, Close, or Escape dismisses it. Leaders and unexpired token sessions have the same save/load controls.

The **Save formation** window also lists existing slots. The last successfully loaded or saved slot in the current session is selected automatically, including after switching tabs. Choose **Update selected slot** to replace that slot after confirmation, or select **Create a new save slot** to keep a separate copy. You can edit the formation name in either case. Event completeness requirements apply to both saving and updating.

Saves retain assigned members' names so load messages can identify departed players by name, team, party, and slot. CSV imports also backfill names into older saves before removing roster records. If an older save's player was already deleted before names were captured, the message shows that the name is unavailable. These names are reference information; only current roster members are assigned to the loaded board.

**Undo** and **Redo** keep the last 30 board changes in the current browser session, including clear, auto-balance, and loading a formation. History is reset after a roster change, a page reload, or a board update from another session. Board writes use a transaction and revision check so a stale edit or Undo cannot overwrite a newer shared formation. Save/delete operations on the playbook are separate from board history; deleting a saved formation asks for confirmation.

Roster imports preserve existing player IDs when trimmed, case-insensitive IGNs match. Loading a saved setup clears assignments for players no longer in the roster and duplicate assignments. The load message lists each affected team and party by its custom name, with the number of departed members needing replacement. Other players retain their exact slots; existing empty slots are not counted as departed members. Saved snapshots themselves remain unchanged.

Deploy the current `firestore.rules` when upgrading; shared board updates now include the `boardEditId` revision marker.

### Compact view and team screenshots

**Auto-balance teams** opens a five-slot party preference window. Every slot defaults to **Any**, selecting the highest-GS available player across all roles. Select Tank, Healer, or DPS to restrict a slot, then optionally select a specific job within that role. The template applies to the corresponding empty slots in every existing party. Specific jobs are filled first, then role-only slots, then Any slots; each uses highest matching gear score and the roster status filter. Assigned players remain in place, players are never duplicated, and unmatched slots stay empty. Confirm with **Fill empty slots** or cancel without changes. Preferences reset to Any each time the window opens; Undo can restore the board after filling.

Team Builder defaults to **Compact view**, with smaller job icons and player cards. Toggle it beside the assigned-player count; the preference is remembered in this browser.

Member cards use a status dot with a tooltip instead of Online/Offline text and have tighter spacing. **Save formation** and **Load formation** stay in the sticky Team Builder header alongside Undo, Redo, Auto-balance, and Clear All, so they remain accessible while scrolling.

Choose **Screenshot team** on a team to open a clean preview containing only that team's parties. Each party has a row of five slots, including empty slots, with wrapped player names, job icons, gear scores, and online status. **Actual size** lets you inspect the details; **Fit to screen** shows the whole sheet. **Download PNG** exports a sharp 2880-pixel-wide image regardless of your screen size. The export includes the guild, battle mode, team and party names, without the roster sidebar or editing controls.

Creating a screenshot does not change or save the formation. This feature requires no additional Firestore rules.

### Existing data

Old global `members`, `savedTeams`, and `guilds/default` records are not automatically migrated or exposed to new accounts. Export or back up existing data before deploying the new rules. Import the appropriate roster into each newly created guild. Browser demo data remains available in the local demo.

### Verification

Run `npm run build` and `npm test`. Run `npm run test:rules` to start a local Firestore emulator and test token creation, ownership, full-access sessions, owner-only token copying and management, cross-guild isolation, expiry, revocation, and leader onboarding. The emulator uses the isolated `demo-ronw-tests` project and requires Java 21 or later. Set `FIREBASE_EMULATORS_PATH` to a writable directory if needed.

For manual local integration testing, start `firebase emulators:start --only auth,firestore --project demo-ronw-tests`. In a separate terminal, set `VITE_USE_FIREBASE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-ronw-tests` before starting Vite. Emulator connections are opt-in and limited to development builds; do not use real account credentials in local tests.

Once Firebase is configured and the rules are deployed, also verify with two separate test accounts that each can import and reload its own roster while cross-guild reads and writes are denied. Real account creation, email delivery, and deployed rules require a configured Firebase project; a production build alone does not verify these services.

## Job icons

Role labels and auto-balance share these class roles: **Tank**: Swordsman, Knight, Crusader, Lord Knight, Paladin, Rune Knight, Royal Guard. **Healer**: Acolyte, Priest, High Priest, Arch Bishop. All other classes are **DPS**. Matching ignores case, spaces, and punctuation.

Roster cards and compact team-planner cards display the supplied job icons for all 48 classes in the reference images. Class matching ignores capitalization, spaces, and punctuation (for example, `Archbishop` and `Arch Bishop` match the same icon). Unknown classes show a neutral fallback. The original reference images live in `src/assets/jobs`; `src/components/JobIcon.jsx` maps each class to its icon tile.

## CSV imports

If an upload reports **permission-denied**, publish the latest local `firestore.rules` in Firebase Console → Firestore Database → Rules. Older rules that do not allow the `boardEditId` field reject the entire roster import and board reset. Token sessions also need to be unexpired and unrevoked. The uploader now shows the Firebase error code, distinguishes network failures, and lets you retry the same file.

Roster replacement and resetting the active board are committed atomically: if Firebase rejects the import, the existing roster and board are preserved. Retained players are updated in place, preserving IDs used by saved formations.

The importer supports both the requested names (`Player Name / IGN`, `Level`, `Guild Position`) and the supplied guild-export names (`Player`, `Lv.`, `Position`). It validates an IGN, ignores blank rows, and skips duplicate IGNs.
