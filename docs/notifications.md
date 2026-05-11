# System Notifications

FlowDeck fires desktop notifications when commands that require your attention complete. This is useful when you switch to another application while the AI processes a task — you will be alerted when your input is needed or when a long-running command is ready for review.

---

## How It Works

When an interactive command finishes (one that either asks questions or produces output you need to approve), FlowDeck sends a desktop notification through the OS notification system. Notification urgency depends on the command:

- **Critical-level (urgent):** `/fd-discuss`, `/fd-plan`, `/fd-verify`, `/fd-deploy-check`, `/fd-new-project`  
  These commands present questions or decisions that block further progress. The notification is sent at high urgency so it appears even in Do Not Disturb mode on some systems.

- **Info-level:** `/fd-new-feature`, `/fd-fix-bug`, `/fd-write-docs`, `/fd-checkpoint`  
  These commands complete autonomously and notify you that output is ready for review. Low urgency — appears in notification center but does not interrupt focus.

Notifications are **best-effort**: if the notification system is unavailable (missing package, SSH session without display, headless CI), FlowDeck logs a warning and continues silently. No command is blocked by a notification failure.

---

## Linux (`notify-send`)

FlowDeck uses `notify-send` from the `libnotify` package. A desktop session (X11 or Wayland) must be active.

### Installation

```bash
# Debian / Ubuntu
sudo apt install libnotify-bin

# Fedora / RHEL / CentOS Stream
sudo dnf install libnotify

# Arch Linux
sudo pacman -S libnotify
```

### Verify

```bash
notify-send "FlowDeck" "Notifications working"
```

A toast notification should appear in the top-right corner of your desktop (or wherever your notification daemon places them — GNOME, KDE, and sway all position them differently).

---

## macOS (`osascript`)

`osascript` is a standard macOS tool available on every installation. No additional packages are needed.

### Allow notifications from Terminal

macOS requires per-application notification permission:

1. Open **System Preferences** (macOS 12 and earlier) or **System Settings** (macOS 13+)
2. Navigate to **Notifications**
3. Find **Terminal** in the app list (or your OpenCode host application if you run it outside Terminal)
4. Set **Allow Notifications** to on
5. Choose **Alerts** or **Banners** depending on your preference

### Verify

```bash
osascript -e 'display notification "Notifications working" with title "FlowDeck"'
```

---

## Windows (PowerShell toast)

FlowDeck uses the `Windows.UI.Notifications` WinRT API via PowerShell. This requires Windows 10 or later and PowerShell 5 or later. No additional installation is needed.

### Allow notifications from PowerShell

1. Open **Settings → System → Notifications**
2. Scroll to the app list and find **Windows PowerShell**
3. Enable notifications for Windows PowerShell

### Verify

```powershell
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
    [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$template.SelectSingleNode("//text[@id='1']").InnerText = "FlowDeck"
$template.SelectSingleNode("//text[@id='2']").InnerText = "Notifications working"
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("FlowDeck").Show($toast)
```

---

## Notification Content Reference

| Command | Title | Body |
|---------|-------|------|
| `/fd-discuss` | `FlowDeck: /fd-discuss` | Your input is needed — please check OpenCode |
| `/fd-plan` | `FlowDeck: /fd-plan` | Your input is needed — please check OpenCode |
| `/fd-verify` | `FlowDeck: /fd-verify` | Your input is needed — please check OpenCode |
| `/fd-deploy-check` | `FlowDeck: /fd-deploy-check` | Your input is needed — please check OpenCode |
| `/fd-new-project` | `FlowDeck: /fd-new-project` | Your input is needed — please check OpenCode |
| `/fd-new-feature` | `FlowDeck: /fd-new-feature complete` | Review the output and choose your next step |
| `/fd-fix-bug` | `FlowDeck: /fd-fix-bug complete` | Review the output and choose your next step |
| `/fd-write-docs` | `FlowDeck: /fd-write-docs complete` | Review the output and choose your next step |
| `/fd-checkpoint` | `FlowDeck: /fd-checkpoint` | State saved — safe to close this session |

---

## Disabling Notifications

Notifications are opt-out at the OS level. To stop receiving them:

- **Linux:** Uninstall `libnotify-bin` (`sudo apt remove libnotify-bin`) or close your notification daemon
- **macOS:** System Settings → Notifications → find Terminal → set Allow Notifications to off
- **Windows:** Settings → System → Notifications → Windows PowerShell → toggle off

Alternatively, when FlowDeck runs in a non-interactive environment (CI pipeline, headless server, SSH session without `$DISPLAY`) it detects the absence of a notification system and skips notification dispatch automatically. No configuration is needed for headless use.

---

## Troubleshooting

### Linux: notifications not appearing

**`notify-send` command not found:**
```bash
which notify-send   # should return a path
sudo apt install libnotify-bin
```

**`notify-send` runs but nothing appears:**
```bash
echo $DISPLAY   # must not be empty; e.g. :0 or :1
```

If `$DISPLAY` is empty, you are in a session that is not connected to a display server. Set it explicitly if you are connected to a local machine via SSH:
```bash
export DISPLAY=:0
notify-send "test" "test"
```

**Running under Wayland:**
```bash
echo $WAYLAND_DISPLAY   # should be wayland-0 or similar
```

Some distributions require `notify-send` version 0.8+ for Wayland support. Check: `notify-send --version`.

---

### macOS: notifications not appearing

1. Run the verification command above — if it shows no notification, Terminal notifications are disabled
2. Check System Settings → Notifications → Terminal → Allow Notifications is on
3. Check that **Focus** or **Do Not Disturb** is not suppressing alerts
4. On macOS 14+, check that notification permissions have not been reset after an OS update

---

### Windows: notifications not appearing

1. Verify Settings → System → Notifications → **Notifications** master toggle is on
2. Verify **Windows PowerShell** is enabled in the app-level list
3. Check that **Focus Assist** is not set to **Alarms only** during your work hours
4. If running OpenCode as an administrator, PowerShell inherits elevated privileges; some Windows configurations suppress toasts from elevated processes

---

← [Back to Index](index.md)
