package net.gryntech.ulak.upload

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Same pipeline as the web app: longest edge 1920 px, JPEG quality 82 (PNG kept as PNG).
 * Decodes with down-sampling so a 50 MP photo never has to fit in memory at full size.
 */
object ImageCompressor {

    private const val MAX_DIMENSION = 1920
    private const val JPEG_QUALITY = 82
    private const val MAX_PNG_BYTES = 5L * 1024 * 1024 // larger PNGs are re-encoded as JPEG

    data class Output(val file: File, val mime: String, val extension: String)

    fun compress(resolver: ContentResolver, uri: Uri, sourceMime: String, outputBase: File): Output {
        val bitmap = decodeScaled(resolver, uri) ?: throw IOException("Görsel çözümlenemedi.")
        try {
            if (sourceMime == "image/png") {
                val png = File(outputBase.path + ".png")
                png.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                if (png.length() <= MAX_PNG_BYTES) return Output(png, "image/png", "png")
                png.delete()
            }
            val jpeg = File(outputBase.path + ".jpg")
            val opaque = if (bitmap.hasAlpha()) flattenOnWhite(bitmap) else bitmap
            try {
                jpeg.outputStream().use { opaque.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
            } finally {
                if (opaque !== bitmap) opaque.recycle()
            }
            return Output(jpeg, "image/jpeg", "jpg")
        } finally {
            bitmap.recycle()
        }
    }

    private fun decodeScaled(resolver: ContentResolver, uri: Uri): Bitmap? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // ImageDecoder handles HEIC and EXIF orientation itself
            val source = ImageDecoder.createSource(resolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val (w, h) = targetSize(info.size.width, info.size.height)
                decoder.setTargetSize(w, h)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_DIMENSION) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null

        val (w, h) = targetSize(decoded.width, decoded.height)
        val scaled = if (w != decoded.width) Bitmap.createScaledBitmap(decoded, w, h, true).also { decoded.recycle() } else decoded
        return applyExifRotation(resolver, uri, scaled)
    }

    private fun targetSize(width: Int, height: Int): Pair<Int, Int> {
        val longest = max(width, height)
        if (longest <= MAX_DIMENSION) return width to height
        val ratio = MAX_DIMENSION.toFloat() / longest
        return (width * ratio).roundToInt().coerceAtLeast(1) to (height * ratio).roundToInt().coerceAtLeast(1)
    }

    private fun applyExifRotation(resolver: ContentResolver, uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = try {
            resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        } catch (e: Exception) {
            null
        } ?: return bitmap

        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> return bitmap
        }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees) }, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }

    private fun flattenOnWhite(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(out).apply {
            drawColor(Color.WHITE)
            drawBitmap(src, 0f, 0f, null)
        }
        return out
    }
}
