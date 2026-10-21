Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
foreach ($kind in @('categories','experiences')) {
 $outputPath = Join-Path 'dist/assets/optimized' $kind
 New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
 foreach ($file in Get-ChildItem -LiteralPath (Join-Path 'dist/assets' $kind) -File) {
  $image = [System.Drawing.Image]::FromFile($file.FullName)
  try {
   foreach ($width in @(480,960)) {
    $height = [Math]::Max(1,[int][Math]::Round($image.Height * $width / $image.Width))
    $bitmap = [System.Drawing.Bitmap]::new($width,$height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    try {
     $graphics.Clear([System.Drawing.Color]::White)
     $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
     $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
     $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
     $graphics.DrawImage($image,0,0,$width,$height)
     $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]92)
     $targetPath = Join-Path $outputPath ($file.BaseName + '-' + $width + '.jpg')
     $bitmap.Save([System.IO.Path]::GetFullPath($targetPath),$encoder,$parameters)
    } finally { $parameters.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
   }
  } finally { $image.Dispose() }
 }
}
# Category art carries a cream studio backdrop in the source PNG. Normalize it
# after resizing so the cards always sit on the same white surface.
& (Join-Path $PSScriptRoot 'white-category-art.ps1')
Get-ChildItem dist/assets/optimized -Recurse -File | Measure-Object Length -Sum
