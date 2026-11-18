<#
  Libera a placa de rede para acordar o PC com o botão de ligar da central (o ESP32 manda
  o "pacote mágico" do Wake-on-LAN).

  Precisa de administrador: o script pede a confirmação do Windows sozinho.
  Rode uma vez em cada PC (de novo só se trocar de placa ou reinstalar o driver):

    powershell -ExecutionPolicy Bypass -File acordar-pela-rede.ps1

  O que ele faz em cada placa de rede física:
    - liga "acordar com pacote mágico" no driver, se estiver desligado;
    - desliga "acordar com padrão", para o PC não acordar sozinho com qualquer tráfego da rede;
    - marca "permitir que este dispositivo acorde o computador".
#>
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`""
    return
}

$canWake = @(powercfg /devicequery wake_programmable)

# As chaves com * são padrão do Windows, iguais em qualquer idioma e fabricante.
function Set-Keyword($nic, $keyword, $value) {
    $prop = Get-NetAdapterAdvancedProperty -Name $nic.Name -RegistryKeyword $keyword -ErrorAction SilentlyContinue
    if (-not $prop) { return 'não existe nesta placa' }
    if ([string]$prop.RegistryValue -eq [string]$value) { return 'já estava certo' }
    # Muda e reinicia a placa: a conexão cai por alguns segundos.
    Set-NetAdapterAdvancedProperty -Name $nic.Name -RegistryKeyword $keyword -RegistryValue $value
    return 'alterado'
}

foreach ($nic in Get-NetAdapter -Physical) {
    Write-Host ''
    Write-Host "== $($nic.Name): $($nic.InterfaceDescription)"
    Write-Host "   MAC: $($nic.MacAddress)"
    Write-Host "   Acordar com pacote mágico: $(Set-Keyword $nic '*WakeOnMagicPacket' 1)"
    Write-Host "   Acordar com padrão (desligado): $(Set-Keyword $nic '*WakeOnPattern' 0)"
    if ($canWake -contains $nic.InterfaceDescription) {
        powercfg /deviceenablewake $nic.InterfaceDescription
        Write-Host '   Pode acordar o computador: sim'
    } else {
        Write-Host '   Esta placa não consegue acordar o computador.'
    }
}

Write-Host ''
Write-Host 'Dispositivos que podem acordar o PC agora:'
powercfg /devicequery wake_armed | ForEach-Object { Write-Host "   $_" }
Write-Host ''
Write-Host 'Confira se o ESP32 manda o pacote para um dos MACs acima.'
Write-Host 'Pelo Wi-Fi, o PC só acorda do repouso (não da hibernação nem desligado).'
Write-Host 'Pelo cabo, também pode acordar desligado, se a BIOS permitir.'
