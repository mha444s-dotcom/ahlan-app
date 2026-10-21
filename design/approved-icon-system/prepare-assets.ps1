param([switch]$Install)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class ApprovedAssetBounds {
 public static int[] Scan(Bitmap original) {
  using(var image=original.Clone(new Rectangle(0,0,original.Width,original.Height),PixelFormat.Format32bppArgb)) {
   var bits=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try {
    int stride=Math.Abs(bits.Stride),left=image.Width,top=image.Height,right=-1,bottom=-1,transparent=0;
    byte[] data=new byte[stride*image.Height];Marshal.Copy(bits.Scan0,data,0,data.Length);
    for(int y=0;y<image.Height;y++)for(int x=0;x<image.Width;x++) {
     int alpha=data[y*stride+x*4+3];if(alpha<8)transparent++;
     if(alpha>32){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}
    }
    return new int[]{left,top,right,bottom,transparent};
   } finally {image.UnlockBits(bits);}
  }
 }
}
'@
$catalog=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'catalog.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'qa') -Force | Out-Null
$report=@()
foreach($asset in $catalog.assets) {
 $sourcePath=Join-Path $PSScriptRoot ('source/'+$asset.name+'.png')
 if(-not(Test-Path -LiteralPath $sourcePath)){throw ('Missing generated source: '+$asset.name)}
 $source=[Drawing.Bitmap]::new($sourcePath)
 try {
  $box=[ApprovedAssetBounds]::Scan($source)
  $fraction=$box[4]/($source.Width*$source.Height)
  if($fraction -lt .15 -or $box[2] -lt $box[0]){throw ('Expected true alpha transparency: '+$asset.name)}
  $left=[Math]::Max(0,$box[0]-5);$top=[Math]::Max(0,$box[1]-5)
  $right=[Math]::Min($source.Width-1,$box[2]+5);$bottom=[Math]::Min($source.Height-1,$box[3]+5)
  $bounds=[Drawing.Rectangle]::new($left,$top,$right-$left+1,$bottom-$top+1)
  foreach($size in @(32,64,128,256)) {
   $folder=Join-Path $PSScriptRoot ('exports/'+$size)
   New-Item -ItemType Directory -Path $folder -Force | Out-Null
   $bitmap=[Drawing.Bitmap]::new($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
   $canvas=[Drawing.Graphics]::FromImage($bitmap)
   try {
    $canvas.Clear([Drawing.Color]::Transparent)
    $canvas.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $canvas.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighQuality
    $canvas.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale=$size*.86/[Math]::Max($bounds.Width,$bounds.Height)
    $width=[single]($bounds.Width*$scale);$height=[single]($bounds.Height*$scale)
    $target=[Drawing.RectangleF]::new([single](($size-$width)/2),[single](($size-$height)/2),$width,$height)
    $canvas.DrawImage($source,$target,$bounds,[Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save((Join-Path $folder ($asset.name+'.png')),[Drawing.Imaging.ImageFormat]::Png)
   } finally {$canvas.Dispose();$bitmap.Dispose()}
  }
  $report+=[pscustomobject]@{Name=$asset.name;Label=$asset.label;Width=$source.Width;Height=$source.Height;TrueAlpha=$true;TransparentFraction=[Math]::Round($fraction,4);CoreBounds=@($left,$top,$right,$bottom)}
 } finally {$source.Dispose()}
}
$report | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $PSScriptRoot 'qa/image-check.json')
if($Install){
 $workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
 $destination=[IO.Path]::GetFullPath((Join-Path $workspace 'dist/assets/ahlan-ui-icons'))
 if(-not $destination.StartsWith($workspace+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid asset destination'}
 foreach($size in @(32,64,128,256)) {
  $target=Join-Path $destination ([string]$size);New-Item -ItemType Directory -Path $target -Force | Out-Null
  foreach($asset in $catalog.assets){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('exports/'+$size+'/'+$asset.name+'.png')) -Destination (Join-Path $target ($asset.name+'.png'))}
 }
}
Write-Output ('Prepared '+$report.Count+' transparent icons at 32, 64, 128 and 256 pixels. Installed: '+[bool]$Install)
