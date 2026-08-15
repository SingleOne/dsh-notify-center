import { spawn } from 'node:child_process';
import { renderLocal } from './render.js';
const AUMID_SETTER_SOURCE = String.raw `
using System;
using System.Runtime.InteropServices;

public static class DshNotifyCenterAumid {
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPVARIANT {
        public ushort vt;
        public ushort wReserved1, wReserved2, wReserved3;
        public IntPtr pValue;
        public IntPtr pValue2;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PROPERTYKEY pkey);
        void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        void Commit();
    }

    const ushort VT_LPWSTR = 31;
    const int GPS_READWRITE = 0x2;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHGetPropertyStoreFromParsingName(
        string pszPath, IntPtr pbc, int flags, ref Guid riid, out IntPtr ppv);

    public static void Set(string shortcutPath, string aumid) {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IntPtr pointer;
        int result = SHGetPropertyStoreFromParsingName(
            shortcutPath, IntPtr.Zero, GPS_READWRITE, ref iid, out pointer);
        if (result != 0) throw new COMException("property store open failed", result);
        IPropertyStore store = (IPropertyStore)Marshal.GetObjectForIUnknown(pointer);
        PROPERTYKEY key = new PROPERTYKEY {
            fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
            pid = 5
        };
        PROPVARIANT value = new PROPVARIANT {
            vt = VT_LPWSTR,
            pValue = Marshal.StringToCoTaskMemUni(aumid)
        };
        try {
            store.SetValue(ref key, ref value);
            store.Commit();
        } finally {
            Marshal.FreeCoTaskMem(value.pValue);
            Marshal.Release(pointer);
        }
    }
}
`;
function base64Utf8(value) {
    return Buffer.from(value, 'utf8').toString('base64');
}
function psQuote(value) {
    return `'${value.replaceAll("'", "''")}'`;
}
function toastTag(id) {
    return id.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-64);
}
export function buildWindowsScript(title, body, id, sound) {
    const title64 = base64Utf8(title);
    const body64 = base64Utf8(body);
    const setter64 = base64Utf8(AUMID_SETTER_SOURCE);
    const tag = toastTag(id);
    const audio = sound ? '' : '<audio silent="true"/>';
    return [
        "$ErrorActionPreference='Stop'",
        `$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${title64}'))`,
        `$b=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${body64}'))`,
        "$appId='DeepSeekHarness.NotifyCenter'",
        'try {',
        "  $shortcut=Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\dsh-notify-center.lnk'",
        "  $reg='HKCU:\\Software\\Classes\\AppUserModelId\\DeepSeekHarness.NotifyCenter'",
        '  New-Item -Path $reg -Force | Out-Null',
        "  New-ItemProperty -Path $reg -Name DisplayName -Value 'DeepSeek Harness' -Force | Out-Null",
        '  $registered=(Get-ItemProperty -Path $reg -Name Registered -ErrorAction SilentlyContinue).Registered -eq 1',
        '  if (-not $registered -or -not (Test-Path -LiteralPath $shortcut)) {',
        '    $shell=New-Object -ComObject WScript.Shell',
        '    $link=$shell.CreateShortcut($shortcut)',
        '    $link.TargetPath=Join-Path $env:WINDIR \'System32\\WindowsPowerShell\\v1.0\\powershell.exe\'',
        "    $link.Arguments='-NoProfile -WindowStyle Hidden -Command \\\"exit\\\"'",
        '    $link.WorkingDirectory=$env:WINDIR',
        "    $link.Description='DeepSeek Harness notifications'",
        '    $link.Save()',
        `    $setter=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${setter64}'))`,
        '    Add-Type -TypeDefinition $setter',
        '    [DshNotifyCenterAumid]::Set($shortcut,$appId)',
        '    New-ItemProperty -Path $reg -Name Registered -PropertyType DWord -Value 1 -Force | Out-Null',
        '  }',
        '  [Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null',
        '  [Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] | Out-Null',
        '  $et=[System.Security.SecurityElement]::Escape($t)',
        '  $eb=[System.Security.SecurityElement]::Escape($b)',
        `  $xmlText='<toast><visual><binding template="ToastGeneric"><text>'+$et+'</text><text>'+$eb+'</text></binding></visual>${audio}</toast>'`,
        '  $xml=New-Object Windows.Data.Xml.Dom.XmlDocument',
        '  $xml.LoadXml($xmlText)',
        '  $toast=[Windows.UI.Notifications.ToastNotification]::new($xml)',
        `  $toast.Tag=${psQuote(tag)}`,
        "  $toast.Group='dsh-notify-center'",
        '  $toast.ExpirationTime=[DateTimeOffset]::Now.AddDays(1)',
        '  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)',
        '  Start-Sleep -Seconds 3',
        '} catch {',
        "  if ($env:DSH_NOTIFY_CENTER_DEBUG -eq '1') { Write-Warning ('Toast failed: '+$_.Exception.ToString()) }",
        '  Add-Type -AssemblyName System.Windows.Forms',
        '  Add-Type -AssemblyName System.Drawing',
        '  $icon=New-Object System.Windows.Forms.NotifyIcon',
        '  $icon.Icon=[System.Drawing.SystemIcons]::Information',
        '  $icon.BalloonTipIcon=[System.Windows.Forms.ToolTipIcon]::Info',
        '  $icon.BalloonTipTitle=$t.Substring(0,[Math]::Min($t.Length,63))',
        '  $icon.BalloonTipText=$b.Substring(0,[Math]::Min($b.Length,255))',
        '  $icon.Visible=$true',
        '  $icon.ShowBalloonTip(8000)',
        '  Start-Sleep -Milliseconds 8500',
        '  $icon.Dispose()',
        '}',
    ].join(';');
}
export function appleScriptQuote(value) {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
export function commandForPlatform(platform, envelope, config) {
    const rendered = renderLocal(envelope, config.locale);
    if (platform === 'win32') {
        const script = buildWindowsScript(rendered.title, rendered.body, envelope.id, config.local.sound);
        return {
            command: 'powershell.exe',
            args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
            timeoutMs: 30_000,
            stdin: script,
        };
    }
    if (platform === 'darwin') {
        const sound = config.local.sound ? ' sound name "default"' : '';
        return {
            command: 'osascript',
            args: ['-e', `display notification ${appleScriptQuote(rendered.body)} with title ${appleScriptQuote(rendered.title)}${sound}`],
            timeoutMs: 10_000,
        };
    }
    if (platform === 'linux') {
        return {
            command: 'notify-send',
            args: ['-a', 'DeepSeek Harness', '-u', envelope.kind === 'error' ? 'critical' : 'normal', rendered.title, rendered.body],
            timeoutMs: 10_000,
        };
    }
    return null;
}
function runCommand(command, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new Error('local notification cancelled'));
            return;
        }
        let settled = false;
        const child = spawn(command.command, [...command.args], {
            stdio: [command.stdin === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'],
            windowsHide: true,
        });
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
            if (error)
                reject(error);
            else
                resolve();
        };
        const abort = () => {
            child.kill();
            finish(new Error('local notification cancelled'));
        };
        const timeout = setTimeout(() => {
            child.kill();
            finish(new Error(`local notification command timed out after ${command.timeoutMs}ms`));
        }, command.timeoutMs);
        signal.addEventListener('abort', abort, { once: true });
        child.once('error', error => finish(new Error(`cannot start ${command.command}: ${error.message}`)));
        child.once('close', code => finish(code === 0 ? undefined : new Error(`${command.command} exited with code ${code ?? 'unknown'}`)));
        child.stdin?.once('error', error => finish(new Error(`cannot write to ${command.command}: ${error.message}`)));
        if (command.stdin !== undefined)
            child.stdin?.end(command.stdin, 'utf8');
    });
}
export async function sendLocalNotification(envelope, config, signal, platform = process.platform) {
    const command = commandForPlatform(platform, envelope, config);
    if (!command)
        throw new Error(`local notifications are not supported on ${platform}`);
    await runCommand(command, signal);
}
//# sourceMappingURL=local.js.map