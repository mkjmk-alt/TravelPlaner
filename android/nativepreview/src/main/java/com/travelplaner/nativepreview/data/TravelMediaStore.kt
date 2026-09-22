package com.travelplaner.nativepreview.data

import com.travelplaner.nativepreview.domain.TripBackup
import java.io.File
import java.util.UUID

data class TravelMediaReference(val tripId: String, val fileName: String, val byteCount: Int)

class TravelMediaStore(private val root: File) {
    companion object {
        const val maxImageBytes = 2_621_440
        internal fun isSupportedImage(bytes: ByteArray): Boolean = bytes.copyOfRange(0, minOf(bytes.size, 8)).contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)) || bytes.size >= 3 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() && bytes[2] == 0xff.toByte()
    }
    init { require(root.mkdirs() || root.isDirectory) }

    fun write(bytes: ByteArray, tripId: String, requestedExtension: String? = null): TravelMediaReference {
        require(bytes.size <= maxImageBytes) { "사진은 2.5 MiB까지 저장할 수 있어요." }
        val extension = imageExtension(bytes, requestedExtension)
        val directory = tripDirectory(tripId).apply { require(mkdirs() || isDirectory) }
        val name = "${UUID.randomUUID()}.$extension"
        val destination = File(directory, name); val temporary = File(directory, ".${UUID.randomUUID()}.tmp")
        temporary.writeBytes(bytes)
        require(temporary.renameTo(destination)) { temporary.delete(); "사진 저장에 실패했어요." }
        return TravelMediaReference(tripId, name, bytes.size)
    }
    fun read(reference: TravelMediaReference): ByteArray {
        val bytes = safeFile(reference).readBytes()
        require(bytes.size <= maxImageBytes && isSupportedImage(bytes)) { "사진 파일을 읽지 못했어요." }
        return bytes
    }
    fun remove(reference: TravelMediaReference) { safeFile(reference).takeIf { it.exists() }?.delete() }

    fun reference(tripId: String, fileName: String): TravelMediaReference {
        safeFile(TravelMediaReference(tripId, fileName, 0))
        return TravelMediaReference(tripId, fileName, 0)
    }

    private fun tripDirectory(tripId: String) = File(root, TripBackup.hash(tripId.encodeToByteArray()))
    private fun safeFile(reference: TravelMediaReference): File {
        require(reference.tripId.isNotBlank() && Regex("[A-Za-z0-9-]+\\.(jpg|jpeg|png)").matches(reference.fileName))
        val directory = tripDirectory(reference.tripId).canonicalFile
        val file = File(directory, reference.fileName).canonicalFile
        require(file.path.startsWith(directory.path + File.separator))
        return file
    }
    private fun imageExtension(bytes: ByteArray, requested: String?): String {
        require(isSupportedImage(bytes)) { "PNG 또는 JPEG 사진만 저장할 수 있어요." }
        return if (bytes.copyOfRange(0, 2).contentEquals(byteArrayOf(0xff.toByte(), 0xd8.toByte()))) if (requested == "jpeg") "jpeg" else "jpg" else "png"
    }
}
