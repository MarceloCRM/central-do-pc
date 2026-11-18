<#
  Faz o Windows entrar sozinho na sua conta quando o PC liga, e o agente da central bloqueia a
  tela logo em seguida. Sem isso, o PC ligado pela central fica parado na tela de senha e o
  agente (que só roda com alguém logado) não aparece.

  Precisa de administrador: o script pede a confirmação do Windows sozinho.

    powershell -ExecutionPolicy Bypass -File agent\entrar-sozinho.ps1           # ligar
    powershell -ExecutionPolicy Bypass -File agent\entrar-sozinho.ps1 -Remove   # desligar

  O que ele faz:
    - desliga "só permitir entrar com Windows Hello" (senão o logon automático não funciona);
    - baixa o Autologon da Sysinternals (Microsoft), confere a assinatura e abre ele: VOCÊ digita a
      senha lá. O Autologon guarda a senha criptografada pelo Windows (segredo LSA), não em texto;
    - liga "lockAtBoot" no config.json do agente: ao iniciar logo depois de ligar, ele bloqueia a tela.

  Risco: entre o Windows entrar e o agente bloquear passam alguns segundos com a área de trabalho
  aberta, para quem estiver na frente do PC.
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $argList = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`""
    if ($Remove) { $argList += ' -Remove' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    return
}

function Step($text) { Write-Host "==> $text" }

# --- Autologon da Sysinternals, conferido pela assinatura da Microsoft
$dir = Join-Path $env:TEMP 'central-autologon'
$exe = Join-Path $dir ($(if ([Environment]::Is64BitOperatingSystem) { 'Autologon64.exe' } else { 'Autologon.exe' }))
if (-not (Test-Path $exe)) {
    Step 'Baixando o Autologon (Sysinternals)'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $zip = Join-Path $dir 'AutoLogon.zip'
    Invoke-WebRequest -UseBasicParsing 'https://download.sysinternals.com/files/AutoLogon.zip' -OutFile $zip
    Expand-Archive $zip -DestinationPath $dir -Force
}
$sig = Get-AuthenticodeSignature $exe
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw "A assinatura do $exe não é da Microsoft. Parei sem mudar nada."
}

# --- Config do agente (o mesmo usuário, só que como administrador)
$configFile = Join-Path $env:LOCALAPPDATA 'CentralPC\agent\config.json'
function Set-LockAtBoot([bool]$on) {
    if (-not (Test-Path $configFile)) { Write-Host "    (agente não instalado em ${configFile}: pulei)"; return }
    $config = Get-Content -Raw -Encoding UTF8 $configFile | ConvertFrom-Json
    $config | Add-Member -NotePropertyName lockAtBoot -NotePropertyValue $on -Force
    [IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
    Step ("lockAtBoot = $on no config.json do agente")
}

$passwordless = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device'
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

if ($Remove) {
    Step 'Abrindo o Autologon: clique em Disable'
    Start-Process $exe -ArgumentList '/accepteula' -Wait
    Set-LockAtBoot $false
    if (Test-Path $passwordless) { Set-ItemProperty $passwordless DevicePasswordLessBuildVersion 2 -Type DWord }
    Step 'Feito: o Windows volta a pedir a senha ao ligar.'
    return
}

if (Test-Path $passwordless) {
    Set-ItemProperty $passwordless DevicePasswordLessBuildVersion 0 -Type DWord
    Step 'Desligado "só permitir entrar com Windows Hello"'
}
Step 'Abrindo o Autologon: confira o usuário, digite a SUA senha do Windows e clique em Enable'
Start-Process $exe -ArgumentList '/accepteula' -Wait
if ((Get-ItemProperty $winlogon).AutoAdminLogon -ne '1') {
    throw 'O logon automático não foi ligado (o Autologon fechou sem Enable). Rode de novo.'
}
Set-LockAtBoot $true
Step 'Pronto. Na próxima vez que o PC ligar, o Windows entra sozinho e a tela bloqueia em seguida.'
