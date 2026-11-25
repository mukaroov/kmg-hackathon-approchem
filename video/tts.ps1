# Озвучка сценария голосами Microsoft (локально, без сети: наружу ничего не уходит).
#   powershell -File video/tts.ps1 -In segments.json -OutDir out -Voices "Microsoft Irina Desktop,Microsoft Pavel" -Rate 0
#   powershell -File video/tts.ps1 -List     — список голосов
# segments.json — [{ "id": "seg_01", "text": "..." }]. На выходе out/<id>.wav и строка JSON с использованным голосом.
# Голоса перебираются по порядку: первый доступный — основной, следующие — запасные. Ищутся в двух движках:
# System.Speech (голоса «… Desktop») и Windows.Media.SpeechSynthesis (голоса OneCore, например «Microsoft Pavel»).
# Если ни один из названных голосов не найден, берётся любой русский голос.
param([string]$In, [string]$OutDir, [string]$Voices = "Microsoft Irina Desktop,Microsoft Pavel", [int]$Rate = 0, [switch]$List)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sapiVoices = @($sapi.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { [pscustomobject]@{ name = $_.VoiceInfo.Name; lang = $_.VoiceInfo.Culture.Name; engine = "sapi" } })
$rtVoices = @()
try {
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $rtVoices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; lang = $_.Language; engine = "winrt"; info = $_ } })
} catch { }
$all = @($sapiVoices) + @($rtVoices)
if ($List) { [Console]::Out.WriteLine((@($all | ForEach-Object { @{ name = $_.name; lang = $_.lang; engine = $_.engine } }) | ConvertTo-Json -Compress)); exit 0 }

$chosen = $null
foreach ($v in ($Voices -split ",")) { $v = $v.Trim(); $hit = $all | Where-Object { $_.name -eq $v } | Select-Object -First 1; if ($hit) { $chosen = $hit; break } }
if (-not $chosen) { $chosen = $all | Where-Object { $_.lang -eq "ru-RU" } | Select-Object -First 1 }
if (-not $chosen) { [Console]::Out.WriteLine('{"status":"error","error":"нет русского голоса Microsoft"}'); exit 2 }

$segs = Get-Content -Raw -Encoding UTF8 $In | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if ($chosen.engine -eq "sapi") {
  $sapi.SelectVoice($chosen.name)
  $sapi.Rate = $Rate
  foreach ($g in $segs) { $sapi.SetOutputToWaveFile((Join-Path $OutDir ($g.id + ".wav"))); $sapi.Speak([string]$g.text) }
  $sapi.SetOutputToNull()
} else {
  # WinRT: асинхронный синтез в поток WAV; Rate System.Speech (−10…10) переводится в SpeakingRate (0,5…6)
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $rt = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $rt.Voice = $chosen.info
  $rt.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(6.0, 1.0 + 0.1 * $Rate))
  foreach ($g in $segs) {
    $task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($rt.SynthesizeTextToStreamAsync([string]$g.text)))
    $null = $task.Wait(-1)
    $src = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($task.Result)
    $dst = [System.IO.File]::Create((Join-Path $OutDir ($g.id + ".wav")))
    $src.CopyTo($dst); $dst.Close(); $src.Close()
  }
  $rt.Dispose()
}
$sapi.Dispose()
[Console]::Out.WriteLine((@{ status = "ok"; voice = $chosen.name; engine = $chosen.engine; installed = @($all | ForEach-Object { $_.name }) } | ConvertTo-Json -Compress))
