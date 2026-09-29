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

## Update the app (Settings → Update)

You do **not** rebuild a DMG/exe every time. Put the new code in git (or on a PC that already has it), then click **Update**.

### Pipeline

1. Change the code on this computer.
2. Push it:

```bash
git add -A
git commit -m "your change"
git push
```

3. In OfficeLink → **Settings**, paste the git URL under **Git repository** (GitHub or any git remote) and click **Save**.
4. On every office PC, open **Settings** and click **Update**.

OfficeLink fetches that code, replaces what is running, and restarts. You do not need to bump the version number or build installers.

If you have not set a git URL, **Update** copies the newest code over the office Wi-Fi from a colleague who already has it. Keep OfficeLink open on the computer that has the new code.

The first time, install from the DMG/exe above. After that, use the Update button.

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
