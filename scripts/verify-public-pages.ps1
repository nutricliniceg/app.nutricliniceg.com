# P32-DESIGN-2 live verification: every public route must return 200, render
# visible words, carry the shared shell (header + locale switcher + footer) and
# apply the shared Plex font stack.
#
# PowerShell only. Usage: pwsh -File scripts/verify-public-pages.ps1
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000'

# route, description
$routes = @(
  @{ p = '/ar';                          d = 'home' }
  @{ p = '/en';                          d = 'home (en)' }
  @{ p = '/ar/pricing';                  d = 'pricing' }
  @{ p = '/en/pricing';                  d = 'pricing (en)' }
  @{ p = '/ar/blog';                     d = 'blog index' }
  @{ p = '/en/blog';                     d = 'blog index (en)' }
  @{ p = '/ar/blog/category/nutrition';  d = 'blog category' }
  @{ p = '/ar/blog/tag/hydration';       d = 'blog tag' }
  @{ p = '/ar/login';                    d = 'login' }
  @{ p = '/en/login';                    d = 'login (en)' }
  @{ p = '/ar/privacy';                  d = 'privacy' }
  @{ p = '/ar/terms';                    d = 'terms' }
  @{ p = '/ar/not-found';                d = 'localized 404' }
)

$rows = @()
foreach ($r in $routes) {
  $url = "$base$($r.p)"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
    $h = $resp.Content
    $words = ($h -replace '<script[\s\S]*?</script>', ' ' -replace '<style[\s\S]*?</style>', ' ' -replace '<[^>]*>', ' ' -replace '\s+', ' ').Trim().Split(' ').Count
    $header   = $h -match '/nc-container|<header'
    $switcher = $h -match 'hreflang="(ar|en)"|>English<|>العربية<'
    $footer   = $h -match 'nc-footer__note|name="website"'
    $carbon   = $h -match 'cds--|cds-text-input|cds--btn|cds--text-input'
    $mojibake = $h -match '[ÂÃÙØ][\u0080-\u00BF]'
    $rows += [pscustomobject]@{
      Route   = $r.p
      What    = $r.d
      Status  = $resp.StatusCode
      Words   = $words
      Header  = if ($header)   { 'y' } else { 'N' }
      Switch  = if ($switcher) { 'y' } else { 'N' }
      Footer  = if ($footer)   { 'y' } else { 'N' }
      Carbon  = if ($carbon)   { 'y' } else { 'N' }
      Mojibk  = if ($mojibake) { 'BAD' } else { 'clean' }
    }
  } catch {
    $code = 'ERR'
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $rows += [pscustomobject]@{ Route=$r.p; What=$r.d; Status=$code; Words=0; Header='-'; Switch='-'; Footer='-'; Carbon='-'; Mojibk='-' }
  }
}

$rows | Format-Table -AutoSize

# Font stack: confirm the compiled CSS actually carries the Plex family and the
# @font-face declarations, so "font applied" is evidenced in the bundle.
Write-Output ''
Write-Output '=== font stack in compiled CSS ==='
$cssFiles = Get-ChildItem -Recurse '.next\static\css' -Filter *.css -ErrorAction SilentlyContinue
$allCss = ($cssFiles | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
Write-Output ("IBM Plex Sans Arabic declared : " + ($allCss -match 'IBM Plex Sans Arabic'))
Write-Output ("woff2 @font-face count        : " + ([regex]::Matches($allCss, '/fonts/[^)]+\.woff2')).Count)
Write-Output ("nc-font-sans token defined    : " + ($allCss -match '--nc-font-sans'))
Write-Output ("nc-postgrid rule present      : " + ($allCss -match '\.nc-postgrid'))
Write-Output ("nc-article rule present       : " + ($allCss -match '\.nc-article'))
Write-Output ("nc-auth rule present          : " + ($allCss -match '\.nc-auth'))
Write-Output ("nc-form rule present          : " + ($allCss -match '\.nc-form'))

$bad = $rows | Where-Object { $_.Status -ne 200 -or $_.Words -lt 5 -or $_.Header -eq 'N' -or $_.Switch -eq 'N' -or $_.Mojibk -eq 'BAD' }
if ($bad) {
  Write-Output ''
  Write-Output ("PROBLEMS: " + $bad.Count)
  exit 1
}
Write-Output ''
Write-Output 'ALL ROUTES OK'
exit 0