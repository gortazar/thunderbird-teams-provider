# Thunderbird Teams Provider

A Thunderbird extension that integrates Microsoft Teams chat directly into Thunderbird.

![Build Status](https://github.com/gortazar/thunderbird-teams-provider/actions/workflows/build.yml/badge.svg)

## Features

- **Unified inbox experience** – access all your Teams chats without leaving Thunderbird.
- **Chat list** – all your Teams conversations listed in the left panel, grouped and sorted by recent activity.
- **Message view** – full conversation thread displayed on the right when a chat is selected.
- **Send messages** – type a reply in the compose field at the bottom and press **Enter** to send.
- **Unread indicators** – chats with new messages are shown in **bold** (Thunderbird style), with a badge count on the Teams button.
- **Avatar or initials** – profile photos are shown by default; an option lets you disable them and show sender initials (first + last name) in a coloured circle instead.
- **Automatic refresh** – chats and messages are polled every 30 seconds; the current open thread refreshes every 15 seconds.

---

## Table of Contents

1. [Building on Linux](#building-on-linux)
2. [Allowing the plugin to access your Teams account](#allowing-the-plugin-to-access-your-teams-account)
3. [Plugin options](#plugin-options)
4. [Installing on Thunderbird](#installing-on-thunderbird)
   - [Standard installation (DEB / RPM / tarball)](#standard-installation)
   - [Snap installation](#snap-installation)
5. [Development workflow](#development-workflow)
6. [CI / CD](#ci--cd)

---

## Building on Linux

### Prerequisites

| Dependency | Minimum version | Install |
|------------|----------------|---------|
| **Node.js** | 18 | `sudo apt install nodejs` or [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 8 | bundled with Node.js |
| **git** | any | `sudo apt install git` |

> **Ubuntu / Debian one-liner:**
> ```bash
> sudo apt update && sudo apt install -y nodejs npm git
> ```

> **Fedora / RHEL:**
> ```bash
> sudo dnf install -y nodejs npm git
> ```

### Build steps

```bash
# 1 – Clone the repository
git clone https://github.com/gortazar/thunderbird-teams-provider.git
cd thunderbird-teams-provider

# 2 – Install build tools (web-ext)
npm install

# 3 – Lint the extension (optional but recommended)
npm run lint

# 4 – Build the .xpi file
npm run build
```

The build output is placed in `web-ext-artifacts/thunderbird_teams_provider-<version>.xpi`.

---

## Allowing the plugin to access your Teams account

### For end-users — no setup required

The extension works **out of the box**, using the same sign-in experience as Thunderbird's
built-in Microsoft mail support:

1. Install the extension (see [Installing on Thunderbird](#installing-on-thunderbird)).
2. Click the **Teams** button in the vertical sidebar on the left.
3. Click **Sign in with Microsoft**.
4. A Microsoft login page opens — enter your email, password, and one-time code as usual.
5. The first time you sign in from an organisational account you may be prompted to
   grant the application access to your Teams chats (identical to the first-time
   authorisation request Thunderbird shows when you add a Microsoft email account).
6. Done — your chats load automatically.

> No Azure portal access is needed. No Client ID needs to be configured.

### For administrators — admin consent (optional)

`Chat.ReadWrite` is a Microsoft Graph permission that some organisations require
an administrator to pre-approve for all users. If your users see a
*"Need admin approval"* screen when signing in, an Azure AD global/Application admin
can grant tenant-wide consent using the URL below (replace `<TENANT_ID>` with your
Directory ID and `<CLIENT_ID>` with the extension's Application ID):

```
https://login.microsoftonline.com/<TENANT_ID>/adminconsent?client_id=<CLIENT_ID>
```

### For developers — building with your own app registration

If you are building from source and want to publish the extension under your own
Azure AD application (e.g. for a custom organisational deployment), follow these steps:

#### Step 1 – Register an Azure AD application

1. Sign in to the [Azure portal](https://portal.azure.com).
2. Navigate to **Azure Active Directory → App registrations → New registration**.
3. Fill in the form:
   - **Name**: `Thunderbird Teams Provider` (or any name you prefer)
   - **Supported account types**: *Accounts in any organizational directory and
     personal Microsoft accounts* (broadest compatibility) or
     *Accounts in this organizational directory only* for single-tenant.
   - **Redirect URI**: select **Public client / native (mobile & desktop)** and
     enter the redirect URL from **extension options → Advanced → sign-in redirect**.
4. Click **Register**.

#### Step 2 – Add API permissions

1. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
2. Add: `Chat.ReadWrite`, `User.Read`, `offline_access`.
3. Click **Add permissions**, then optionally **Grant admin consent**.

#### Step 3 – Embed the Client ID

Replace the placeholder in `background/background.js`:

```js
const DEFAULT_CLIENT_ID = "YOUR_EXTENSION_CLIENT_ID_HERE";
```

with your *Application (client) ID* from the Azure portal overview page, then
rebuild the extension with `npm run build`.

Users of your build won't need to configure anything — they just click **Sign in**.

---

## Plugin options

Open **Thunderbird → Add-ons Manager → Thunderbird Teams Provider → Preferences**
(or click *Open Options* on the sign-in screen).

| Option | Description |
|--------|-------------|
| **Client ID** *(advanced)* | Override the extension's built-in Azure AD app ID. Leave blank to use the pre-configured default. |
| **Tenant ID** *(advanced)* | Override the Azure AD tenant. Leave blank for `common` (personal and work accounts). |
| **Disable avatars** | When checked, profile photos are never fetched. Each sender is represented by a coloured circle containing their initials (first letter of first name + first letter of last name, e.g. **JS** for *Jane Smith*). Useful for privacy or bandwidth savings. |
| **Sign in / Sign out** | Authenticate or revoke the session. Tokens are stored locally in Thunderbird's secure extension storage. |

---

## Installing on Thunderbird

Download the latest `.xpi` file from the
[Releases page](https://github.com/gortazar/thunderbird-teams-provider/releases).

### Standard installation

Works for Thunderbird installed via DEB package, RPM, tarball, or Flatpak.

**Method A – Drag and drop**

Drag the `.xpi` file onto the Thunderbird window. Thunderbird will prompt you to install it.

**Method B – Add-ons Manager**

1. Open Thunderbird.
2. Press `Ctrl+Shift+A` to open the **Add-ons Manager**.
3. Click the ⚙ gear icon (top-right of the add-ons list).
4. Select **Install Add-on From File…**.
5. Browse to the downloaded `.xpi` and click **Open**.
6. Click **Add** on the confirmation prompt.

After installation a **Teams** button (purple **T** icon) appears in the vertical
spaces toolbar on the left side of the Thunderbird window.

### Snap installation

The official Thunderbird snap (`thunderbird` from Canonical) runs in a confined
sandbox. Extensions are installed the same way as for the standard package:

1. Open the Thunderbird **snap** application.
2. Press `Ctrl+Shift+A` → gear icon → **Install Add-on From File…**.
3. Select the `.xpi` file.

> **Note:** The snap's sandbox does not restrict Thunderbird's ability to load
> extensions via the Add-ons Manager. You do **not** need to run any `snap connect`
> commands for this extension.

> **Tip:** If the file picker in the snap cannot see your `Downloads` folder, copy
> the `.xpi` to your home directory first:
> ```bash
> cp ~/Downloads/thunderbird_teams_provider-*.xpi ~/
> ```
> Then browse to `~` in the file picker.

---

## Development workflow

```bash
# Run the extension inside Thunderbird (hot-reload)
npm run start
```

This launches a temporary Thunderbird profile with the extension pre-loaded.
You need Thunderbird installed and on `$PATH` (or set `WEB_EXT_FIREFOX` to the
Thunderbird binary path).

```bash
# Lint without building
npm run lint
```

---

## CI / CD

The GitHub Actions workflow (`.github/workflows/build.yml`) runs on every pull request
and every push to `main`:

1. **Lint** – `web-ext lint` checks the extension for common issues.
2. **Build** – `web-ext build` produces a signed-ready `.xpi`.
3. **Artifact** – the `.xpi` is uploaded as a workflow artifact (available for 30 days).
4. **Release** – on a successful push to `main` a GitHub Release is automatically created
   and the `.xpi` is attached as the release asset.

---

## License

Apache 2.0 – see [LICENSE](LICENSE).
