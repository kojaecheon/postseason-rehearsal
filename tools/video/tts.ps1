param([string]$Json = "$PSScriptRoot\tts.json", [string]$OutDir = "$PSScriptRoot\out\tts", [int]$Rate = 0)
Add-Type -AssemblyName System.Speech
$items = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json
New-Item -ItemType Directory -Force $OutDir | Out-Null
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Heami Desktop')
$s.Rate = $Rate
$s.Volume = 100
foreach ($it in $items) {
  $p = Join-Path $OutDir ("n{0:d2}.wav" -f $it.n)
  $s.SetOutputToWaveFile($p)
  $s.Speak($it.text)
  $s.SetOutputToNull()
  Write-Output ("{0} {1}" -f $it.n, $p)
}
$s.Dispose()
