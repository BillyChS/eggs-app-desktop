; Inno Setup script for Eggs App. Build it with installer\build.ps1, which publishes the app and passes the defines.
;
; DATA SAFETY: this installer must never touch %LocalAppData%\EggsApp (the database, backups, logs, WebView2 data).
; The program goes to %LocalAppData%\Programs\Eggs App, a different folder. The uninstaller removes only the files
; this setup installed. Never add an [UninstallDelete] or [InstallDelete] entry outside {app}.

#ifndef AppVersion
  #error AppVersion is not defined. Build with installer\build.ps1.
#endif
#ifndef PublishDir
  #error PublishDir is not defined. Build with installer\build.ps1.
#endif
#ifndef OutputDir
  #define OutputDir "..\artifacts\installer"
#endif

; Never change it: it is how an update finds the existing install.
#define AppGuid "C1F4550E-3E5E-42BF-AB37-3831F5322F25"
#define AppName "Eggs App"
#define AppExe "EggsApp.Desktop.exe"

[Setup]
AppId={{{#AppGuid}}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Billy Chacón
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}

; Per-user: no administrator rights, and {autopf} is %LocalAppData%\Programs.
PrivilegesRequired=lowest
DefaultDirName={autopf}\{#AppName}
DisableDirPage=yes
UsePreviousAppDir=yes
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableWelcomePage=yes
ShowLanguageDialog=no

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Windows 10 1809, the oldest the .NET 10 desktop runtime supports.
MinVersion=10.0.17763

; The app's single-instance mutex (SingleInstance.cs): setup and uninstall ask to close Eggs App first.
; Setup never closes it on its own, which could lose something being typed.
AppMutex=Local\EggsApp.Desktop.SingleInstance
CloseApplications=no
RestartApplications=no

OutputDir={#OutputDir}
OutputBaseFilename=EggsApp-Setup-{#AppVersion}
SetupIconFile=..\src\EggsApp.Desktop\Assets\app.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Writes Setup Log YYYY-MM-DD #NNN.txt to %TEMP%, for when something goes wrong.
SetupLogging=yes

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
; The default asks to remove "todos sus componentes", which sounds like the data goes too. It doesn't.
es.ConfirmUninstall=¿Desinstalar %1?%n%nLos datos (ventas, clientes, abonos, gastos y respaldos) no se borran: se quedan en la computadora y vuelven a aparecer si se instala de nuevo.

[CustomMessages]
es.OpenApp=Abrir Eggs App
es.NewerInstalled=Ya está instalada la versión %1 de Eggs App, que es más nueva que esta (%2).%n%nNo se instaló nada y no se cambió ningún dato. Use el instalador de la versión %1 o una más nueva.
es.WebView2Missing=No se encontró Microsoft Edge WebView2 Runtime, que Eggs App necesita para mostrar sus pantallas.%n%nLa instalación va a seguir, pero Eggs App no va a abrir hasta que se instale. Se descarga gratis de Microsoft en:%nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703

[InstallDelete]
; The UI's file names change with every build; without this, old ones would pile up across updates.
Type: filesandordirs; Name: "{app}\wwwroot"

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:OpenApp}"; Flags: nowait postinstall skipifsilent

[Code]
const
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{{#AppGuid}}_is1';
  WebView2Key = 'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

{ Compares "1.2.10" and "1.10.0" part by part, as numbers. Missing parts count as 0. }
function CompareVersions(A, B: String): Integer;
var
  PartA, PartB, DotA, DotB: Integer;
begin
  Result := 0;
  while (Result = 0) and ((A <> '') or (B <> '')) do
  begin
    DotA := Pos('.', A);
    DotB := Pos('.', B);
    if DotA = 0 then DotA := Length(A) + 1;
    if DotB = 0 then DotB := Length(B) + 1;
    PartA := StrToIntDef(Copy(A, 1, DotA - 1), 0);
    PartB := StrToIntDef(Copy(B, 1, DotB - 1), 0);
    Delete(A, 1, DotA);
    Delete(B, 1, DotB);
    if PartA < PartB then Result := -1
    else if PartA > PartB then Result := 1;
  end;
end;

{ Microsoft's documented check: a "pv" value that is present and not 0.0.0.0, per machine or per user. }
function HasWebView2Version(RootKey: Integer; SubKey: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

function IsWebView2Installed: Boolean;
begin
  Result := HasWebView2Version(HKLM32, 'SOFTWARE\' + WebView2Key)
    or HasWebView2Version(HKLM64, 'SOFTWARE\' + WebView2Key)
    or HasWebView2Version(HKCU, 'Software\' + WebView2Key);
end;

function InitializeSetup: Boolean;
var
  Installed: String;
begin
  Result := True;

  { An older app would refuse the newer database anyway (DatabaseMigrator), but refusing here keeps the newer
    version installed and working. The database is never opened by setup. }
  if RegQueryStringValue(HKCU, UninstallKey, 'DisplayVersion', Installed)
    and (CompareVersions(Installed, '{#AppVersion}') > 0) then
  begin
    Log('Refused: version ' + Installed + ' is installed, this is {#AppVersion}.');
    SuppressibleMsgBox(FmtMessage(CustomMessage('NewerInstalled'), [Installed, '{#AppVersion}']),
      mbCriticalError, MB_OK, IDOK);
    Result := False;
    exit;
  end;

  if not IsWebView2Installed then
  begin
    Log('WebView2 Runtime not found.');
    SuppressibleMsgBox(CustomMessage('WebView2Missing'), mbInformation, MB_OK, IDOK);
  end;
end;
