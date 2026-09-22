import Foundation
import CoreData

enum TripStoreModel {
    // Keep this exact model: existing on-disk stores were made programmatically.
    static var original: NSManagedObjectModel {
        let model = NSManagedObjectModel()
        model.entities = [entity("TripRecord", fields: [("id", .stringAttributeType), ("payload", .binaryDataAttributeType), ("updatedAt", .doubleAttributeType)], unique: "id")]
        return model
    }
    static var stage2: NSManagedObjectModel {
        let model = original
        model.entities += [entity("ImportReceipt", fields: [("sourceHash", .stringAttributeType), ("sourceBytes", .binaryDataAttributeType),
            ("targetID", .stringAttributeType), ("previousTargetIDs", .binaryDataAttributeType), ("importedAt", .doubleAttributeType)], unique: "sourceHash")]
        return model
    }
    static var current: NSManagedObjectModel {
        let model = stage2
        let saved = entity("SavedPlaceRecord", fields: [("id", .stringAttributeType), ("sourceKey", .stringAttributeType),
            ("payload", .binaryDataAttributeType), ("createdAt", .doubleAttributeType), ("updatedAt", .doubleAttributeType)], unique: "id")
        saved.uniquenessConstraints = [["id"], ["sourceKey"]]
        model.entities += [saved]
        return model
    }
    private static func entity(_ name: String, fields: [(String, NSAttributeType)], unique: String) -> NSEntityDescription {
        let entity = NSEntityDescription(); entity.name = name; entity.managedObjectClassName = "NSManagedObject"
        entity.properties = fields.map { name, type in
            let field = NSAttributeDescription(); field.name = name; field.attributeType = type; field.isOptional = false; return field
        }
        entity.uniquenessConstraints = [[unique]]; return entity
    }
    static func migrateIfNeeded(at url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let metadata = try NSPersistentStoreCoordinator.metadataForPersistentStore(ofType: NSSQLiteStoreType, at: url, options: nil)
        if current.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) { return }
        guard let source = [original, stage2].first(where: { $0.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) }) else { throw TripError.invalidDocument }
        let recoveryBase = URL(fileURLWithPath: url.path + ".pre-import.sqlite")
        let recovery = FileManager.default.fileExists(atPath: recoveryBase.path) ? URL(fileURLWithPath: url.path + ".\(UUID().uuidString).pre-import.sqlite") : recoveryBase
        let destination = URL(fileURLWithPath: url.path + ".\(UUID().uuidString).migration.sqlite")
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: source)
        // SQLite-aware copy includes WAL content, unlike copying just the .sqlite file.
        try coordinator.replacePersistentStore(at: recovery, destinationOptions: nil, withPersistentStoreFrom: url, sourceOptions: nil, ofType: NSSQLiteStoreType)
        let entities = source.entities.compactMap(\.name)
        let before = try payloads(at: recovery, model: source, entities: entities)
        let mapping = try NSMappingModel.inferredMappingModel(forSourceModel: source, destinationModel: current)
        let manager = NSMigrationManager(sourceModel: source, destinationModel: current)
        try manager.migrateStore(from: recovery, sourceType: NSSQLiteStoreType, options: nil, with: mapping, toDestinationURL: destination, destinationType: NSSQLiteStoreType, destinationOptions: nil)
        guard try payloads(at: destination, model: current, entities: entities) == before else { throw TripError.invalidDocument }
        let replacer = NSPersistentStoreCoordinator(managedObjectModel: current)
        try replacer.replacePersistentStore(at: url, destinationOptions: nil, withPersistentStoreFrom: destination, sourceOptions: nil, ofType: NSSQLiteStoreType)
        guard try payloads(at: url, model: current, entities: entities) == before else { throw TripError.invalidDocument }
        try? replacer.destroyPersistentStore(at: destination, ofType: NSSQLiteStoreType, options: nil)
        // recovery intentionally remains private and recoverable after a successful migration.
    }
    private static func payloads(at url: URL, model: NSManagedObjectModel, entities: [String]) throws -> [String: NSDictionary] {
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: model)
        let store = try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: [NSReadOnlyPersistentStoreOption: true])
        defer { try? coordinator.remove(store) }
        let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType); context.persistentStoreCoordinator = coordinator
        return try context.performAndWait {
            var result = [String: NSDictionary]()
            for entity in entities {
                for row in try context.fetch(NSFetchRequest<NSManagedObject>(entityName: entity)) {
                    let idField = entity == "ImportReceipt" ? "sourceHash" : "id"
                    guard let id = row.value(forKey: idField) as? String else { throw TripError.invalidDocument }
                    let key = entity + ":" + id
                    guard result[key] == nil else { throw TripError.invalidDocument }
                    // Includes exact binary payload/sourceBytes/history and scalar metadata.
                    result[key] = row.dictionaryWithValues(forKeys: Array(row.entity.attributesByName.keys)) as NSDictionary
                }
            }
            return result
        }
    }
}
