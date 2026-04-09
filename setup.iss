; ===========================================================================
;  Study Practices - Instalador Inno Setup
; ===========================================================================

#define MyAppName      "Study Practices"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "Taty's English"
#define MyAppExeName   "Study_Practices.exe"
#define MyAppURL       "https://github.com/CAI0SAMPAI0/playwright"
#define MyAppId        "{{8F3A2B1C-4D5E-6F7A-8B9C-0D1E2F3A4B5C}"

[Setup]
AppId                              = {#MyAppId}
AppName                            = {#MyAppName}
AppVersion                         = {#MyAppVersion}
AppPublisher                       = {#MyAppPublisher}
AppPublisherURL                    = {#MyAppURL}
AppSupportURL                      = {#MyAppURL}
AppUpdatesURL                      = {#MyAppURL}
VersionInfoVersion                 = {#MyAppVersion}
VersionInfoCompany                 = {#MyAppPublisher}
VersionInfoDescription             = {#MyAppName} - WhatsApp Automation
PrivilegesRequired                 = lowest
PrivilegesRequiredOverridesAllowed = commandline
DefaultDirName                     = {userdocs}\Study_Practices
DefaultGroupName                   = {#MyAppName}
DisableProgramGroupPage            = yes
DisableDirPage                     = no
DirExistsWarning                   = no
CloseApplications                  = yes
CloseApplicationsFilter            = Study_Practices.exe
WizardStyle                        = modern
WizardSizePercent                  = 110
WizardImageFile                    = compiler:WizModernImage.bmp
WizardSmallImageFile               = compiler:WizModernSmallImage.bmp
OutputDir                          = dist
OutputBaseFilename                 = Study_Practices_Setup
Compression                        = lzma2/ultra64
SolidCompression                   = yes
SetupIconFile                      = resources\Taty_s-English-Logo.ico
UninstallDisplayIcon               = {app}\Study_Practices.exe
AllowNoIcons                       = yes
ChangesEnvironment                 = no

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Area de Trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "dist\Study_Practices.exe"; DestDir: "{app}"; DestName: "Study_Practices.exe"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}";  Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

; O app requer elevacao (admin) para o agendador do Windows funcionar.
; Por isso NAO abrimos automaticamente apos instalar — o usuario abre
; pelo atalho criado, que vai pedir o UAC normalmente.
; [Run] removido intencionalmente.

[UninstallDelete]
Type: files;      Name: "{app}\Study_Practices.exe"
Type: dirifempty; Name: "{app}"

[Code]

function IsUpgrade(): Boolean;
begin
  Result := FileExists(ExpandConstant('{userdocs}\Study_Practices\Study_Practices.exe'));
end;

procedure CreateDataFolders(BaseDir: String);
begin
  ForceDirectories(BaseDir + '\user_data');
  ForceDirectories(BaseDir + '\logs');
  ForceDirectories(BaseDir + '\perfil_bot_whatsapp');
  ForceDirectories(BaseDir + '\scheduled_tasks');
  ForceDirectories(BaseDir + '\temp_tasks');
end;

procedure CloseRunningApp();
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM Study_Practices.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsUpgrade() then
    MsgBox(
      'Instalacao existente detectada.' + #13#10 + #13#10 +
      'O que vai acontecer:' + #13#10 +
      '  - Apenas o executavel sera atualizado' + #13#10 +
      '  - Seus agendamentos serao preservados' + #13#10 +
      '  - Sua sessao do WhatsApp sera preservada' + #13#10 +
      '  - Seu historico de envios sera preservado' + #13#10 + #13#10 +
      'Clique em OK para continuar.',
      mbInformation, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    CloseRunningApp();
    CreateDataFolders(WizardDirValue());
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectDir then
  begin
    if DirExists(WizardDirValue()) then
      WizardForm.SelectDirLabel.Caption :=
        'Pasta ja existe. Apenas o executavel sera substituido.' + #13#10 +
        'Seus dados serao preservados.'
    else
      WizardForm.SelectDirLabel.Caption :=
        'A pasta sera criada automaticamente.' + #13#10 +
        'Escolha onde instalar o Study Practices:';
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  sDir: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    sDir := WizardDirValue();
    if (Pos(LowerCase(ExpandConstant('{pf}')),   LowerCase(sDir)) = 1) or
       (Pos(LowerCase(ExpandConstant('{pf32}')), LowerCase(sDir)) = 1) or
       (Pos(LowerCase(ExpandConstant('{win}')),  LowerCase(sDir)) = 1) or
       (Pos(LowerCase(ExpandConstant('{sys}')),  LowerCase(sDir)) = 1) then
    begin
      MsgBox(
        'Nao e possivel instalar em "' + sDir + '".' + #13#10 +
        'Sugestao: ' + ExpandConstant('{userdocs}') + '\Study_Practices',
        mbError, MB_OK);
      Result := False;
    end;
  end;
end;
