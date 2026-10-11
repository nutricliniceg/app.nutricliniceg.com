# P32-SEED verification: HTTP status + visible-word counts for the public
# content pages. Strips markup so the count reflects what a reader sees.
# PowerShell only, per project protocol.

$ErrorActionPreference = 'Continue'
$base = ((Get-Content .env.local | Select-String -Pattern '^APP_URL=').Line -split '=', 2)[1].TrimEnd('/')

function Get-VisibleText([string]$html) {
  # remove script/style blocks entirely, then all tags, then decode entities
  $t = [regex]::Replace($html, '(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ')
  $t = [regex]::Replace($t, '(?s)<!--.*?-->', ' ')
  $t = [regex]::Replace($t, '(?s)<[^>]+>', ' ')
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return $t
}

$targets = @(
  @{ Path = '/ar/pricing'; Expect = @('اشتراك شهري','اشتراك نصف سنوي','EGP') },
  @{ Path = '/ar/blog';    Expect = @('كيف تحسب سعراتك','البروتين','الملصق الغذائي') },
  @{ Path = '/en/blog';    Expect = @('daily calories','Protein','nutrition label') }
)

$results = @()
foreach ($t in $targets) {
  $url = "$base$($t.Path)"
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
    $html = $r.Content
    $text = Get-VisibleText $html
    $words = ($text -split '\s+' | Where-Object { $_ -match '\S' }).Count
    $found = @()
    $missing = @()
    foreach ($needle in $t.Expect) {
      if ($text -like "*$needle*") { $found += $needle } else { $missing += $needle }
    }
    $results += [pscustomobject]@{
      Path     = $t.Path
      Status   = $r.StatusCode
      Words    = $words
      Matched  = $found.Count
      Missing  = if ($missing.Count) { $missing -join ', ' } else { '-' }
    }
  } catch {
    $results += [pscustomobject]@{
      Path = $t.Path; Status = 'ERROR'; Words = 0; Matched = 0; Missing = $_.Exception.Message
    }
  }
}

$results | Format-Table -AutoSize