package com.travelplaner.nativepreview.data

import android.content.ContentResolver
import android.net.Uri
import com.travelplaner.nativepreview.domain.TripBackup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

data class ImageSelectionState(val bytes: ByteArray?, val fileName: String?, val error: String?)

object BackupFileAccess {
    suspend fun read(resolver: ContentResolver, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
        (resolver.openInputStream(uri) ?: throw IOException("파일을 열지 못했어요. 다시 선택해주세요.")).use(TripBackup::read)
    }

    suspend fun readImage(resolver: ContentResolver, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
        (resolver.openInputStream(uri) ?: throw IOException("사진을 열지 못했어요. 다시 선택해주세요.")).use(::readImage)
    }

    fun readImage(input: InputStream, maxBytes: Int = TravelMediaStore.maxImageBytes): ByteArray {
        require(maxBytes > 0) { "사진 크기 제한이 올바르지 않아요." }
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (output.size() <= maxBytes) {
            val count = input.read(buffer, 0, minOf(buffer.size, maxBytes + 1 - output.size()))
            if (count < 0) break
            if (count == 0) {
                val single = input.read()
                if (single < 0) break
                output.write(single)
            } else {
                output.write(buffer, 0, count)
            }
        }
        val bytes = output.toByteArray()
        require(bytes.size <= maxBytes) { "사진은 2.5 MiB까지 선택할 수 있어요." }
        require(TravelMediaStore.isSupportedImage(bytes)) { "PNG 또는 JPEG 사진만 선택할 수 있어요." }
        return bytes
    }

    fun imageSelectionFailure(existingBytes: ByteArray?, existingFileName: String?, message: String): ImageSelectionState =
        ImageSelectionState(existingBytes, existingFileName, message)

    suspend fun write(resolver: ContentResolver, uri: Uri, bytes: ByteArray) = withContext(Dispatchers.IO) {
        (resolver.openOutputStream(uri, "wt") ?: throw IOException("선택한 위치에 저장할 수 없어요.")).use { output -> output.write(bytes); output.flush() }
    }
}
