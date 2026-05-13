# Alta Vision Solar — Proposal & Quotation System

Full-stack Next.js 14 application for generating professional solar PV proposals and managing confirmed customer quotations.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + Shadcn UI |
| Animations | Framer Motion |
| Auth | Firebase Auth (Google OAuth + myiot JWT bridge) |
| Database | Cloud Firestore |
| Storage | Firebase Storage (docx / pdf files) |
| Backend | Next.js API Routes + Firebase Admin SDK |
| Documents | node-docx |
| Email | Resend |
| Theme | next-themes (dark / light) |

---

## Quick Start

### 1. Clone and install
```bash
git clone <repo>
cd altavision
npm install
```

### 2. Firebase setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → Google sign-in provider
3. Enable **Cloud Firestore** (start in production mode)
4. Enable **Firebase Storage**
5. Download service account JSON → save as `firebase-service-account.json` (gitignored)
6. Enable **Identity Platform** for blocking functions

### 3. Environment variables
```bash
cp .env.local.example .env.local
# Fill in all values
```

### 4. Firestore security rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /proposals/{id} {
      allow read, write: if request.auth != null
        && (request.auth.uid == resource.data.createdBy
            || request.auth.token.role == 'admin');
    }
    match /quotations/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.role == 'admin';
    }
    match /products/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.role == 'admin';
    }
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

### 5. Seed the product catalog
```bash
node scripts/seed-products.js
```

### 6. Deploy Firebase blocking function
```bash
cd firebase-functions
npm install firebase-functions firebase-admin
cd ..
firebase deploy --only functions
```

### 7. Run development server
```bash
npm run dev
# Open http://localhost:3000
```

---

## myiot Integration

When a myiot user clicks "Launch Proposal System", myiot should redirect to:

```
https://your-domain.com/login?token=<SIGNED_JWT>
```

The JWT must be signed with `MYIOT_JWT_SECRET` and contain:
```json
{
  "sub": "<user_id>",
  "email": "<user_email>",
  "name": "<display_name>",
  "role": "engineer",
  "exp": <unix_timestamp>
}
```

The system will exchange this JWT for a Firebase custom token automatically.

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          Login page (Google + myiot redirect)
│   ├── (dashboard)/
│   │   ├── layout.tsx         Sidebar + top bar layout
│   │   ├── page.tsx           Dashboard home
│   │   ├── proposals/         Proposals list + wizard
│   │   └── quotations/        Confirmed orders board
│   └── api/
│       ├── auth/myiot/        JWT → custom token exchange
│       ├── auth/session/      Session cookie management
│       ├── proposals/         CRUD + document generation
│       └── quotations/        CRUD
├── components/
│   ├── proposals/
│   │   ├── ProposalWizard.tsx 5-step wizard with Framer Motion
│   │   └── steps/             StepCustomer, StepSite, StepComponents, StepPricing, StepReview
│   └── ui/                    Shadcn components
├── lib/
│   ├── firebase.ts            Client SDK
│   ├── firebase-admin.ts      Admin SDK + JWT exchange
│   ├── auth-context.tsx       React auth provider
│   ├── proposal-builder.ts    Form data → Proposal type
│   └── docx-builder.ts        Proposal → .docx buffer
├── types/index.ts             All TypeScript interfaces
└── middleware.ts              Route protection
```

---

## Generating Documents

Documents are generated server-side via `/api/proposals/[id]/generate`:

1. User clicks "Save & Generate" in the wizard
2. Proposal is saved to Firestore
3. `/api/proposals/[id]/generate` is called (background)
4. `docx-builder.ts` builds the full Alta Vision formatted Word document
5. File is uploaded to Firebase Storage
6. Signed URL (7 days) is saved back to the proposal document
7. User sees a "Download" button on the proposal detail page

---

## Adding Shadcn Components

```bash
npx shadcn-ui@latest add button card input select table badge
npx shadcn-ui@latest add dialog dropdown-menu avatar toast progress
npx shadcn-ui@latest add checkbox textarea separator tabs
```
