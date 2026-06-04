# Releasing muse

How to cut a new build that testers can download from a fixed URL —
**`github.com/finns0309/muse/releases/latest`**.

## One-time setup

1. Create a GitHub **Personal Access Token** (classic) with the `repo` scope:
   GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   → Generate new token → check `repo` → copy it.
2. Keep it somewhere safe. You'll pass it to the release command as `GH_TOKEN`.
   (Optionally add `export GH_TOKEN=ghp_xxx` to your `~/.zshrc` so you don't
   retype it.)

## Cut a release

```bash
# 1. bump the version (patch / minor / major) — this commits + tags
npm version patch

# 2. build + upload the DMG to a GitHub draft release
GH_TOKEN=ghp_xxx npm run release

# 3. push the version bump + tag
git push && git push --tags
```

`npm run release` packages the DMG and uploads it (plus `latest-mac.yml` and a
blockmap) to a **draft** GitHub Release named after the new version.

## Publish it

electron-builder leaves the release as a **draft** so you can review first:

- Go to `github.com/finns0309/muse/releases`
- Open the draft, paste the tester instructions below into the description,
  click **Publish release**.

Once published, `…/releases/latest` points at it. Send testers that one link —
it always resolves to the newest version.

---

## Tester install instructions (paste into the release description)

> **Install muse**
>
> 1. Download `Muse-x.y.z-arm64.dmg` below (Apple Silicon) and open it.
> 2. Drag **Muse** to Applications.
> 3. **First launch:** right-click `Muse.app` → **Open** → **Open** again.
>    (Double-clicking shows "Muse is damaged / can't verify developer" — that's
>    macOS Gatekeeper blocking an unsigned app, not a real problem.)
>    If it still won't open, run once in Terminal:
>    `xattr -cr /Applications/Muse.app`
> 4. muse lives in the **menu bar** (no Dock icon). Summon it anytime with
>    **⌥Space** (Option+Space). First run asks you to scan a QR with the
>    NetEase Cloud Music app to log in.

## Why the Gatekeeper warning

The DMG is **ad-hoc signed** (no paid Apple Developer ID). macOS flags unsigned
apps on first open. The right-click→Open trick (or `xattr -cr`) clears the
quarantine flag once; after that it launches normally. To remove the warning
entirely you'd need an Apple Developer account ($99/yr) for signing + notarization.
