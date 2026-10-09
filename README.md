# CV and publications

One GitHub Pages site with three pages:

| Page | Who can use it | What it does |
| --- | --- | --- |
| `index.html` | Everyone | Publication list with search and filters. Embed this in your website. |
| `editor.html` | Only you (Backprompter sign-in) | Edit publications, themes, keywords, and CV sections. |
| `cv.html` | Only you (Backprompter sign-in) | Full CV with **Save as PDF** and **Download Markdown**. |

## Where the data lives

| Data | Location | Visibility |
| --- | --- | --- |
| Publications | `data/pubs.json` in this repository | Public, because your website shows them |
| CV sections | Your Backprompter user data, key `cv` | Private |
| GitHub owner, repository, branch, token | Your Backprompter user data, key `github` | Private |

The repository holds no secrets and no CV text. The App Key in `editor/config.js` only identifies your Backprompter app, so it is safe in public code. Backprompter stores each user's data under that user's account. Another account cannot read your data, even in the same app.

## Set up (one time)

### 1. Backprompter

1. Create an app in Backprompter. Click **Deploy UI** and select **Email/password** as the only login method. This turns on sign-in for the app.
2. Turn off self sign-up.
3. In **User Authentication**, add yourself. Set your password from the emailed link.
4. Copy the App Key into `editor/config.js`.

### 2. GitHub

1. Push this folder to a public repository, for example `cv`. GitHub Pages on a free account needs a public repository.
2. Go to **Settings → Pages**. Choose **Deploy from a branch**, then **main** and **/ (root)**. Save.
3. Create a token: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories**, then choose this repository.
   - Permissions: **Contents → Read and write**.

### 3. First sign-in

1. Open `https://<your-username>.github.io/cv/editor.html` and sign in.
2. The editor opens **Import and export**, because no CV is stored yet. Load `cv.json`, then click **Save**. The file is not in this repository. Delete your copy after you save it.
3. Go to **Settings**. Enter the owner, repository, branch, and token. Click **Save and connect**. The editor checks the token with GitHub before it stores anything.

You enter the token once. Every device gets it after you sign in.

## Add the publication list to Google Sites

1. In Google Sites, click **Insert → Embed → By URL**.
2. Enter `https://<your-username>.github.io/cv/?embed=1`.
3. Select **Whole page**, insert it, and drag the box to the height you want.

You can also preset filters:

| Option | Example |
| --- | --- |
| `category` | `?embed=1&category=Graph%20Machine%20Learning` |
| `keyword` | `?embed=1&keyword=Epidemics` |
| `type` | `?embed=1&type=journal` (conference, journal, workshop, chapter, preprint, thesis) |
| `year` | `?embed=1&year=2026` |
| `group` | `?embed=1&group=year` (category, year, type) |

## Daily use

- **Add a paper:** Publications → New publication. Or paste BibTeX in Import and export.
- **Change a status:** set Status to *published*, *accepted* (shows "to appear"), *under review*, or *preprint*.
- **Awards:** type the award in "Award or highlight". It shows as a badge on the website and in bold in the CV.
- **Themes and keywords:** rename, reorder, merge, or delete them in Themes and keywords.
- **CV text:** edit sections in CV sections, in Markdown.
- **Save** (or Ctrl/Cmd+S) stores CV changes in Backprompter and commits publication changes to GitHub. Your website updates in about one minute.
- **CV page** opens the saved CV for PDF export. It reads publications from the public site, so wait about one minute after you save a publication.

If you close the tab before you save, the editor keeps a draft in that browser and offers to restore it. **Sign out** deletes the draft.

## Files

```
index.html             public publication list
editor.html            editor (sign-in required)
cv.html                CV page (sign-in required)
data/pubs.json         publications (public)
assets/common.js       shared formatting, BibTeX, and GitHub API code
assets/style.css       styles for the list and the CV
editor/config.js       Backprompter App Key and SDK URL
editor/auth.js         sign-in screen and private storage
editor/admin.js        editor logic
editor/admin.css       editor and sign-in styles
editor/marked.umd.js   Markdown library (marked, MIT license)
```
