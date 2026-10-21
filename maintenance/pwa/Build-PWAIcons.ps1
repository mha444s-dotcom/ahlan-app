param([string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourcePath = Join-Path $ProjectRoot 'dist\assets\ahlan-ui-icons\256\home.png'
$targetDir = Join-Path $ProjectRoot 'dist\assets\pwa'
[void][System.IO.Directory]::CreateDirectory($targetDir)
$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
    foreach ($entry in @(
        @{Name='icon-192.png'; Size=192; Fraction=0.84},
        @{Name='icon-512.png'; Size=512; Fraction=0.84},
        @{Name='icon-maskable-512.png'; Size=512; Fraction=0.56},
        @{Name='apple-touch-icon.png'; Size=180; Fraction=0.84}
    )) {
        $bitmap = New-Object System.Drawing.Bitmap($entry.Size, $entry.Size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F6F3EC'))
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $length = [int][Math]::Round($entry.Size * $entry.Fraction)
            $offset = [int][Math]::Round(($entry.Size - $length) / 2)
            $graphics.DrawImage($source, $offset, $offset, $length, $length)
            $bitmap.Save((Join-Path $targetDir $entry.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
}
finally { $source.Dispose() }
Get-ChildItem -LiteralPath $targetDir -File | Select-Object Name, Length
