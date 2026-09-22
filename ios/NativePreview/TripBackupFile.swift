import SwiftUI
import UniformTypeIdentifiers
import NativeCore

struct TripBackupFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard configuration.file.isRegularFile, let bytes = configuration.file.regularFileContents, bytes.count <= TripBackup.maxBytes else { throw BackupError.tooLarge }
        data = bytes
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
