# OfficeLink

Local office chat for **macOS** and **Windows**. Install it on each computer. It works over **Wi-Fi and LAN (ethernet)** on the same office router — people on wireless and people on a cable can chat together.

Nothing is uploaded to a cloud. Messages and files travel directly between office computers.

## What you can do

- **# general** channel for everyone on the network
- Direct messages and private groups
- Share files of **any size** (PDFs, zips, videos, installers) with progress, pause/cancel, and resume
- Reply, edit, delete, emoji reactions, forward
- `@Name` mentions, typing indicators, delivery and read receipts
- Pin chats, mute notifications, search, dark/light theme
- Available / Away / Do not disturb
- Optional **workspace name** so two teams on the same Wi-Fi stay separate
- **Settings → Update** — fetches the latest code and restarts the app

## Install

### Mac

Two disk images are already built:

- **Apple Silicon (M1/M2/M3/M4):** `dist/OfficeLink-1.2.4-mac-arm64.dmg`
- **Intel Mac:** `dist/OfficeLink-1.2.4-mac-x64.dmg`

Open the matching DMG, drag **OfficeLink** into **Applications**, then open it from there. macOS may ask to allow **local network** access — accept that, or colleagues will not appear automatically.

If Gatekeeper blocks it, right-click the app → **Open**.

To rebuild later: `npm run dist:mac`

### Windows

Two files are already built and ready to copy to a USB stick or office share:

- **Installer:** `dist/OfficeLink-Setup-1.2.4-win-x64.exe`  
  Double-click on a Windows PC, choose a folder, and finish. It creates Start Menu and desktop shortcuts, and allows OfficeLink through Windows Firewall so LAN chat and file downloads work.

Windows may warn that the app is unsigned. Choose **More info** → **Run anyway**.

To rebuild later: `npm run dist:win`

Install the same app on every office computer. There is no central server to set up.

## Update the app — just `git push`

Build and share the DMG/exe **once**. After that you only push code:

```bash
git add -A
git commit -m "your change"
git push
```

Every OfficeLink checks https://github.com/Himanshusinh/chatbocx (the `repository` in `package.json`):

- **When the app opens**, new code is downloaded and the app restarts on it automatically.
- **While it is open**, it checks every 5 minutes and shows an **Update** button at the top of the chat.
- Works without git installed (Windows PCs download a zip from GitHub). The repository must stay public.

What `git push` **cannot** update: the Electron version or the installer itself (app name, icon, firewall rules). For those, build and share a new DMG/exe — `npm run dist:mac` / `npm run dist:win`. Build from a committed, pushed state; the build records its commit so fresh installs know they are current. A newly installed DMG/exe always takes priority over older downloaded code.

## First use

1. Enter your name
2. Colleagues on the same Wi-Fi show up under Direct messages
3. If someone is missing, copy the address at the bottom left and have them click **Add by IP**
4. Drop files into a chat — large files wait for **Download** on the other side
5. Keep OfficeLink open (or in the tray on Windows) so others can download files you shared

On a **Mac**, also turn on **System Settings → Privacy & Security → Local Network → OfficeLink**. If macOS asks to accept incoming connections, click Allow.

## Run from source (developers)

```bash
npm install
npm start
```

Open a second window on the same Mac to try it locally:

```bash
npm run start:second
```

```bash
npm test
```

## How files work

The sender’s computer hosts the file. The receiver copies it over the LAN in 1 MB chunks, with resume if Wi-Fi drops. Files never leave the office network.

Use a **workspace name** in Settings if you share a network with another team and should not see each other.
# chatbocx
