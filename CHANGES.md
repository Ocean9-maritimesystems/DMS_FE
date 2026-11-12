# Changes – DMS_FE

## 25 Oct 2026 – certificates removed, folder table renamed

* Certificates are gone from the office and the vessel apps: the "Certificate expiry" report is removed (Reports and
  Dashboard > Other Documents > All vessels), and search shows every Other Document as a document. The older notes
  below that mention a Certificates page or `/certificates` links no longer apply.
* Folders of Other Documents are `OtherDocument_Folder` / `OtherDocument_FolderID` everywhere (was `FLD_Folder` /
  `FLD_FolderID`): run `Database/022_RenameFolderTable.sql`, `023_RemoveCertificates.sql` and `020_ApiProcedures.sql`
  again on the office database, and update the ships to the matching vessel build.

## 20 Oct 2026 (evening) – merged with `feature/otherdocument`

The folder was switched to the `feature/otherdocument` branch while the changes below were being saved, so part of
them was replaced by the branch's files. They are now merged with the branch:

* Routes: the branch's Inbox, Suggestions, Certificates and Folders pages are kept; `/search` uses the search page
  below (filters, highlighting); `/pending` is the full pending-acknowledgements page. Every page loads on demand.
* Header: Dashboard, Manuals, Circulars, Alerts, Pending acks, Suggestions; search box; account menu with Change
  password. Link names stay visible down to 1300 px wide (icons only below that).
* One way to link to an item: `/manuals?id=`, `/circulars?cirmode=circulars|alerts&id=`, `/certificates?id=`,
  `/suggestions?id=` (`/manuals?manual=` from older links still works). Search and pending lists now open
  certificates and suggestions too.
* `components/Features/SearchPage.tsx` now re-exports `components/Search/SearchPage.tsx` (one search page).
* Circular extras (due days, valid until, manual links, cancel, category settings) called the old
  `api/CircularExtras/...` routes, which the API no longer has; they now call `api/Circular/{id}/Extras`,
  `api/Circular/{id}/Links`, `api/Circular/{id}/Cancel`, `api/Circular/Manual/{id}/...` and `api/Circular/CategorySettings`.

Not working yet (no API behind them): the Inbox page and its unread count (`api/Inbox/...`) and the Certificates page
(`api/Certificates/...`). The Dashboard's own "Pending Acknowledgements" tab from the branch is still there next to
the new `/pending` page.

Checked: type check, lint (0 errors), 12 unit tests, production build, and 27 browser checks against a mock API
(login, header, search and its links, circular extras route, pending tabs, change password, Suggestions page, phone width).

## 20 Oct 2026 – new screens, security, code quality, Vite

Use together with the DMS_API changes of the same day (new endpoints and `Database/015_BackendFixes.sql`).

### Run (first time after this change)

```bash
npm install                    # Create React App is gone; Vite, Vitest and TypeScript 5 come in
npm start                      # http://localhost:3000 (same port and .env settings as before)
```

### New screens

| Screen | Where | API |
| --- | --- | --- |
| Global search | Search box in the header on every page; results page `/search` with filters (manuals, circulars & alerts, documents & certificates, suggestions); query words highlighted; manuals, circulars and alerts open directly | `GET api/Search` |
| Pending acknowledgements | `Pending acks` in the header (`/pending`): **My items**; **Vessels** – a card per vessel (pending / overdue per type, last sync), then the crew list with type and rank filters, or every vessel at once; **Office users** and **Settings** (days to acknowledge, folder limits) for administrators | `api/Pending/*` |
| Change password | User menu (click your name) → Change password; at least 10 characters | `POST api/Login/ChangePassword` |

Also: the header now has the main navigation (Dashboard, Manuals, Circulars, Alerts, Pending acks) on every page.
Links such as `/manuals?manual=12` and `/circulars?cirmode=alerts&id=601` open that item (used by search and pending lists).
Other Documents: View / Download / Delete buttons now work (they only wrote to the browser console before).

### Security

* Removed two scripts loaded from unpkg.com in `public/index.html` (React 17 development builds, unused, third-party).
* Manual HTML is sanitised (DOMPurify) before it is shown in the editor, saved, exported to PDF, or compared:
  scripts, event handlers (`onerror=`…), `javascript:` links and frames are removed.
* Text taken out of an imported PDF is inserted as text, not HTML.
* Attachments: only PDFs, images and plain text open in a browser tab; HTML, SVG and other types are downloaded
  (a page opened from the app would run with the user's login).
* Login says whether the password was wrong, the server failed, or the server could not be reached.
* Administrator-only tabs are hidden for other users (the API checks the role too).

### Code quality

* Typed API calls (`getApiCall<T>`) and response types for the new screens (`src/types/api.ts`).
* Redux store trimmed to what is used; the selected manual is typed (fixed five places that assumed it was set).
* Debug `console.log` calls removed; a stray `;` shown under the PDF import field removed.
* ESLint added (`npm run lint`): 0 errors; 126 warnings left in older code (mostly `any`).
* Unit tests for snippet cleaning, highlighting, sanitising and item links (12 tests).
* Fixed: automatic logout fired immediately for tokens valid longer than ~24 days (browser timer overflow).

### Tooling

* Create React App → **Vite 5** (dev server and build), **Vitest** (tests), **TypeScript 5.6**.
  `.env` names (`REACT_APP_…`) and the `build/` output folder are unchanged.
* Each page is loaded when first opened: the first download is about 290 KB of script instead of 3.3 MB.
* `.env.example`, GitHub Actions workflow (type check, lint, tests, build), new README.
* No longer used and safe to delete: `public/index.html` (the app's page is now `index.html` in the project root),
  `src/reportWebVitals.ts`.

### Checked

Type check, lint, unit tests and production build pass. The built app was driven in Chromium against a mock
API: 41 checks (login errors, search and filters, opening manuals/circulars/alerts from search and from pending
lists, pending tabs and filters, settings, change password, other-document buttons, non-administrator view,
phone width, no console errors).

## 1 Oct 2026 – review fixes

Changes on branch `review-fixes`, from the code review of 1 Oct 2026. Use together with the DMS_API `review-fixes`
branch (the login and new endpoints need it).

## Run

```bash
cp .env.example .env.local     # set REACT_APP_API_URL, e.g. https://localhost:7151/api
npm install --legacy-peer-deps
npm start
npm test                        # 3 tests
npm run typecheck
```

## What changed

| Finding | Change | Files |
| --- | --- | --- |
| S5 / F3 | Real login: token stored in `sessionStorage`, sent as `Authorization: Bearer`, 401 logs out, expired tokens log out automatically | `services/authService.ts`, `services/DMSLifecycleService.ts`, `App.tsx`, `pages/LandingPage.tsx` |
| F6 | No more `TestUser13`, "Test User Name", "COMPANY": user comes from the token; company name and environment label from `.env` | `App.tsx`, `PageHeader.tsx`, `config/appConfig.ts` |
| – | API URL from `REACT_APP_API_URL` (was hard-coded `https://localhost:7151/api`) | `config/appConfig.ts` |
| F1 | Dashboard Pending Approval reads `toApproveCnt` (was always 0) | `DashboardManual.tsx` |
| F2 | Network errors no longer crash the API error handler | `DMSLifecycleService.ts` |
| A2 | Circular category filter sends `categoryId` (was ignored by the API) | `CircularsList.tsx` |
| – | Notifications: mark-as-read sends the real ID, and circular notifications call the Circular endpoint | `NotificationList.tsx`, `NotificationListCicrular.tsx` |
| F4 | Info button uses an icon (the `info.jpg` image was broken on case-sensitive hosts) | `ManualsContent.tsx` |
| F5 | Version History shows real data (was hard-coded sample rows) | `ManualVersionHistory.tsx` |
| F7 | `alert()` replaced by toasts; "Send Message" (no feature behind it) removed; unbuilt import options disabled | `services/notify.ts`, `ManualsTreeView.tsx`, `ManualsContent.tsx`, `AddEditManual.tsx` |
| F8 | Acknowledgement list loads without the 500 ms delay and shows errors | `CircularsList.tsx` |
| S10 | Manual/compare HTML sanitised with DOMPurify before rendering | `ViewCompareManualDetails.tsx`, `HtmlDiff.tsx`, `ApprovalFlow.tsx` |
| UI | One header on every page: logo, title, navigation (Dashboard / Manuals / Circulars), page actions, user, log out | `PageHeader.tsx/.scss`, `Dashboard.tsx` |
| UI | New login page | `pages/Login.tsx/.scss` |
| UI | One date format everywhere ("28 Sep 2026") | `components/utils/formatDate.ts`, circulars, manual header, version history |
| UI | "New circular" moved to the page header; empty "Level -" and "0 Attachments" hidden; Favorites button wired up | `CircularsList.tsx` |
| UI | Dashboard chart uses one colour; numbers no longer underlined; captions readable | `ManualChart.tsx`, `Dashboard.scss` |
| UI | Manuals page usable on tablets/phones: tree keeps its height and stacks above the content | `ManualMainPage.scss` |
| Deps | Removed unused `quill`, `jodit-react-ts`, `html-docx-js`, `html-docx-js-typescript`, `history`, `mammoth`, `file-saver`, `css-loader`, `js-cookie`; declared `dompurify`; types and test libraries moved to `devDependencies` | `package.json`, `package-lock.json` |
| Tests / CI | Default CRA test replaced with login and date tests; GitHub Actions runs typecheck, tests and build | `App.test.tsx`, `.github/workflows/build.yml` |

## Not changed yet

* 126 `any` types and large components (`CircularsList.tsx`, `AddEditCircular.tsx`, `ManualsTreeView.tsx`).
* Inline styles and hard-coded colours outside the files above.
* Moving from Create React App to Vite.

## How it was checked

`npm run typecheck`, `npm test` (3 passing) and `npm run build` succeed. The built app was run in a browser against
a mock API: login, logout, dashboard, manuals, version history, circulars, notification mark-as-read, and the
manuals page at phone width.
