# P32-DESIGN verification â€” local `npm start` (http://localhost:3000).
# Reports HTTP status + visible-word count (markup stripped) for the public
# marketing surfaces, plus a font-reachability probe.
$ErrorActionPreference = 'Continue'

function Get-VisibleText([string]$html) {
  $t = [regex]::Replace($html, '(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ')
  $t = [regex]::Replace($t, '(?s)<!--.*?-->', ' ')
  $t = [regex]::Replace($t, '(?s)<[^>]+>', ' ')
  return [System.Net.WebUtility]::HtmlDecode($t)
}

$base = 'http://localhost:3000'
$targets = @('/ar', '/en', '/ar/pricing', '/ar/blog', '/en/blog')

$rows = @()
foreach ($p in $targets) {
  try {
    $r = Invoke-WebRequest -Uri "$base$p" -UseBasicParsing -TimeoutSec 60
    $text = Get-VisibleText $r.Content
    $words = ($text -split '\s+' | Where-Object { $_ -match '\S' }).Count
    $rows += [pscustomobject]@{
      Path   = $p
      Status = $r.StatusCode
      Words  = $words
      HTMLKB = [math]::Round($r.RawContentLength / 1kb, 1)
    }
  } catch {
    $rows += [pscustomobject]@{ Path = $p; Status = 'ERR'; Words = 0; HTMLKB = 0 }
  }
}
$rows | Format-Table -AutoSize

Write-Output ''
Write-Output '--- font + bidi evidence ---'
$homeHtml = (Invoke-WebRequest -Uri "$base/ar" -UseBasicParsing -TimeoutSec 60).Content
$pricing = (Invoke-WebRequest -Uri "$base/ar/pricing" -UseBasicParsing -TimeoutSec 60).Content

Write-Output ("home  : nc-hero section present   = " + ($homeHtml -match 'nc-hero'))
Write-Output ("home  : value cards               = " + ([regex]::Matches($homeHtml,'class="nc-card"').Count))
Write-Output ("home  : blog teaser cards         = " + ([regex]::Matches($homeHtml,'nc-post').Count))
Write-Output ("pricing: plan cards              = " + ([regex]::Matches($pricing,'class="nc-plan').Count))
Write-Output ("pricing: featured/elevated card   = " + ($pricing -match 'nc-plan--featured'))
Write-Output ("pricing: raw 'EGP / 180d' string   = " + ($pricing -match 'EGP / \d+d'))
Write-Output ("pricing: tabular amount class     = " + ($pricing -match 'nc-plan__amount'))
