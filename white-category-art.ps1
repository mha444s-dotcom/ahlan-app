# Maps the baked-in cream studio backdrop of the 3D category art to pure white.
# The foreground is preserved with a smooth, per-pixel white-balance gain.
# Usage: powershell -ExecutionPolicy Bypass -File .\white-category-art.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

if (-not ('AhlanWhiteBackdrop' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class AhlanWhiteBackdrop
{
    const int Terms = 6;

    static double[] Solve(double[,] a, double[] b)
    {
        int n = b.Length;
        double[,] m = new double[n, n + 1];
        for (int i = 0; i < n; i++)
        {
            for (int j = 0; j < n; j++) m[i, j] = a[i, j];
            m[i, n] = b[i];
        }
        for (int col = 0; col < n; col++)
        {
            int pivot = col;
            for (int row = col + 1; row < n; row++)
                if (Math.Abs(m[row, col]) > Math.Abs(m[pivot, col])) pivot = row;
            if (Math.Abs(m[pivot, col]) < 1e-9) continue;
            if (pivot != col)
                for (int j = col; j <= n; j++) { double t = m[col, j]; m[col, j] = m[pivot, j]; m[pivot, j] = t; }
            double divisor = m[col, col];
            for (int j = col; j <= n; j++) m[col, j] /= divisor;
            for (int row = 0; row < n; row++)
            {
                if (row == col) continue;
                double factor = m[row, col];
                if (factor == 0) continue;
                for (int j = col; j <= n; j++) m[row, j] -= factor * m[col, j];
            }
        }
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = m[i, n];
        return x;
    }

    static double Eval(double[] c, double nx, double ny)
    {
        return c[0] + c[1] * nx + c[2] * ny + c[3] * nx * nx + c[4] * nx * ny + c[5] * ny * ny;
    }

    static double[] Background(double[,] ata, double[] atb)
    {
        double[,] copy = (double[,])ata.Clone();
        double trace = 0;
        for (int i = 0; i < Terms; i++) trace += Math.Abs(copy[i, i]);
        for (int i = 0; i < Terms; i++) copy[i, i] += Math.Max(1e-6, trace * 1e-8);
        return Solve(copy, atb);
    }

    static int Clamp(double value)
    {
        if (value <= 0) return 0;
        if (value >= 255) return 255;
        return (int)Math.Round(value);
    }

    static ImageCodecInfo JpegCodec()
    {
        foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
            if (codec.MimeType == "image/jpeg") return codec;
        return null;
    }

    static void SaveJpeg(Bitmap source, string path, int width, ImageCodecInfo codec, long quality)
    {
        int height = Math.Max(1, (int)Math.Round(source.Height * (double)width / source.Width));
        using (Bitmap target = new Bitmap(width, height, PixelFormat.Format24bppRgb))
        {
            using (Graphics g = Graphics.FromImage(target))
            {
                g.Clear(Color.White);
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(source, 0, 0, width, height);
            }
            using (EncoderParameters parameters = new EncoderParameters(1))
            {
                parameters.Param[0] = new EncoderParameter(Encoder.Quality, quality);
                target.Save(path, codec, parameters);
            }
        }
    }

    public static void Process(string sourcePath, string outputDir, string baseName, int detail = 250)
    {
        using (Bitmap source = new Bitmap(sourcePath))
        {
            int width = source.Width, height = source.Height;
            Rectangle rect = new Rectangle(0, 0, width, height);
            BitmapData data = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            int stride = data.Stride;
            byte[] pixels = new byte[stride * height];
            Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
            source.UnlockBits(data);

            double[,] ataR = new double[Terms, Terms], ataG = new double[Terms, Terms], ataB = new double[Terms, Terms];
            double[] atbR = new double[Terms], atbG = new double[Terms], atbB = new double[Terms];
            int margin = Math.Max(8, Math.Min(width, height) / 90);
            int step = 2;
            double[] terms = new double[Terms];

            for (int y = 0; y < height; y += step)
            {
                bool yEdge = y < margin || y >= height - margin;
                for (int x = 0; x < width; x += step)
                {
                    if (!yEdge && x >= margin && x < width - margin) continue;
                    double nx = (x / (double)(width - 1)) * 2 - 1;
                    double ny = (y / (double)(height - 1)) * 2 - 1;
                    terms[0] = 1; terms[1] = nx; terms[2] = ny;
                    terms[3] = nx * nx; terms[4] = nx * ny; terms[5] = ny * ny;
                    int i = y * stride + x * 3;
                    double r = pixels[i + 2], g = pixels[i + 1], b = pixels[i];
                    for (int p = 0; p < Terms; p++)
                    {
                        for (int q = 0; q < Terms; q++)
                        {
                            double value = terms[p] * terms[q];
                            ataR[p, q] += value; ataG[p, q] += value; ataB[p, q] += value;
                        }
                        atbR[p] += terms[p] * r; atbG[p] += terms[p] * g; atbB[p] += terms[p] * b;
                    }
                }
            }

            double[] coeffR = Background(ataR, atbR);
            double[] coeffG = Background(ataG, atbG);
            double[] coeffB = Background(ataB, atbB);

            using (Bitmap corrected = new Bitmap(width, height, PixelFormat.Format24bppRgb))
            {
                BitmapData target = corrected.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                int targetStride = target.Stride;
                byte[] output = new byte[targetStride * height];

                for (int y = 0; y < height; y++)
                {
                    double ny = (y / (double)(height - 1)) * 2 - 1;
                    for (int x = 0; x < width; x++)
                    {
                        double nx = (x / (double)(width - 1)) * 2 - 1;
                        double bgR = Math.Max(32, Math.Min(255, Eval(coeffR, nx, ny)));
                        double bgG = Math.Max(32, Math.Min(255, Eval(coeffG, nx, ny)));
                        double bgB = Math.Max(32, Math.Min(255, Eval(coeffB, nx, ny)));
                        double gainR = Math.Max(1, Math.Min(1.35, 255 / bgR));
                        double gainG = Math.Max(1, Math.Min(1.35, 255 / bgG));
                        double gainB = Math.Max(1, Math.Min(1.35, 255 / bgB));

                        int i = y * stride + x * 3;
                        double r = pixels[i + 2], g = pixels[i + 1], b = pixels[i];
                        double outR = r * gainR, outG = g * gainG, outB = b * gainB;

                        // A soft white floor removes the last film of cream without touching real detail.
                        if (outR > detail && outG > detail && outB > detail &&
                            Math.Abs(r - bgR) < 10 && Math.Abs(g - bgG) < 10 && Math.Abs(b - bgB) < 10)
                        { outR = 255; outG = 255; outB = 255; }

                        int o = y * targetStride + x * 3;
                        output[o] = (byte)Clamp(outB);
                        output[o + 1] = (byte)Clamp(outG);
                        output[o + 2] = (byte)Clamp(outR);
                    }
                }

                Marshal.Copy(output, 0, target.Scan0, output.Length);
                corrected.UnlockBits(target);

                ImageCodecInfo codec = JpegCodec();
                Directory.CreateDirectory(outputDir);
                SaveJpeg(corrected, Path.Combine(outputDir, baseName + "-480.jpg"), 480, codec, 92);
                SaveJpeg(corrected, Path.Combine(outputDir, baseName + "-960.jpg"), 960, codec, 92);
            }
        }
    }
}
'@
}

$sourceDir = Join-Path $PSScriptRoot 'dist/assets/categories'
$outputDir = Join-Path $PSScriptRoot 'dist/assets/optimized/categories'
$previewDir = if ($args.Count -gt 0) { $args[0] } else { $null }
$fileNames = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }
$files = if ($fileNames.Count -gt 0) {
  $fileNames | ForEach-Object { Get-Item (Join-Path $sourceDir $_) }
} else {
  Get-ChildItem -LiteralPath $sourceDir -Filter *.png -File
}

foreach ($file in $files) {
  $target = if ($previewDir) { $previewDir } else { $outputDir }
  [AhlanWhiteBackdrop]::Process($file.FullName, $target, $file.BaseName)
  Write-Host "Processed $($file.Name)"
}

