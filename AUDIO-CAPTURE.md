# System Audio Capture Setup

To capture system audio (Google Meet, Zoom, YouTube, etc.), your OS needs a **virtual audio driver** — a loopback device that routes playback audio back as an input source.

---

## macOS — BlackHole

**BlackHole** is a free, open-source virtual audio driver.

### Step 1 — Install BlackHole

**Option A: Homebrew (recommended)**
```bash
brew install blackhole-2ch
```

**Option B: Direct download**

Go to [existential.audio/blackhole](https://existential.audio/blackhole/) → select **BlackHole 2ch** → enter email → download `.pkg` → run the installer.

Restart your Mac after installation.

### Step 2 — Verify installation

Open **System Settings → Sound**. You should see **BlackHole 2ch** in both the Output and Input device lists. If not, restart and check again.

### Step 3 — Create an Aggregate Device (hear audio + capture simultaneously)

Without this step, selecting BlackHole as output will mute your speakers.

1. Open **Audio MIDI Setup** (`/Applications/Utilities/Audio MIDI Setup.app` or Spotlight → "Audio MIDI Setup")
2. Click **"+"** at the bottom left → **Create Aggregate Device**
3. Check both:
   - ✅ **BlackHole 2ch**
   - ✅ **Your speakers** (e.g. "MacBook Pro Speakers" or "External Headphones")
4. Name it something memorable, e.g. **"Node Trans Aggregate"**
5. Set the **Clock Source** to your speakers (not BlackHole) to avoid audio glitches

### Step 4 — Set Aggregate Device as default output

**System Settings → Sound → Output** → select **"Node Trans Aggregate"**

Audio will now play through your speakers while BlackHole captures it simultaneously.

### Step 5 — Configure in Node Trans

**Settings → Audio**:
- **Audio Source** → `System Audio` or `Both`
- **System Audio Device** → `BlackHole 2ch`

> **Remember:** Switch your Output back to your speakers when you're done.

### Troubleshooting

| Issue | Fix |
|-------|-----|
| BlackHole not in device list | Restart your Mac; reinstall if still missing |
| Audio delay / echo | In Audio MIDI Setup, set Clock Source to your main speakers |
| App doesn't detect BlackHole | Restart the app; verify System Audio Device is set correctly |
| No sound after setup | Check System Settings → Sound → Output is set to the Aggregate Device |

---

## Windows — VB-CABLE

**VB-CABLE** is a free virtual audio driver for Windows.

### Step 1 — Install VB-CABLE

1. Go to [vb-audio.com/Cable](https://vb-audio.com/Cable/)
2. Download **VB-CABLE Driver**
3. Extract → run **`VBCABLE_Setup_x64.exe`** as **Administrator**
4. Click **"Install Driver"** → wait for completion
5. Restart your PC

### Step 2 — Verify installation

Right-click the speaker icon → **Sound settings**:
- Output: **"CABLE Input (VB-Audio Virtual Cable)"**
- Input: **"CABLE Output (VB-Audio Virtual Cable)"**

### Step 3 — Route output to CABLE Input

**Settings → System → Sound → Output** → select **"CABLE Input"**

> ⚠️ Your speakers will go silent. Fix this in Step 4.

### Step 4 — Enable "Listen to this device" to hear audio simultaneously

1. Right-click speaker icon → **Sounds** → **Recording** tab
2. Double-click **"CABLE Output"** → **Listen** tab
3. Check **"Listen to this device"** → select your real speakers → OK

### Step 5 — Configure in Node Trans

**Settings → Audio**:
- **Audio Source** → `System Audio` or `Both`
- **System Audio Device** → `CABLE Output (VB-Audio Virtual Cable)`

### Alternative — Stereo Mix

Some Windows machines have **Stereo Mix** built in (Realtek audio):

1. Right-click speaker icon → **Sounds** → **Recording** tab
2. Right-click empty area → **"Show Disabled Devices"**
3. If **Stereo Mix** appears → right-click → **Enable**
4. Select **Stereo Mix** as your System Audio Device in Node Trans

### Troubleshooting

| Issue | Fix |
|-------|-----|
| CABLE not visible after install | Restart PC; ensure you ran installer as Administrator |
| No audio after selecting CABLE | Enable "Listen to this device" (Step 4) |
| App doesn't see CABLE Output | Restart the app |
| Audio latency | Open VB-CABLE Control Panel → increase buffer size |
