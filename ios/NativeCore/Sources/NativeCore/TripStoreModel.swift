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
    static var syncV2: NSManagedObjectModel {
        let model = current
        guard let trip = model.entitiesByName["TripRecord"],
              let saved = model.entitiesByName["SavedPlaceRecord"] else { return model }
        trip.properties += [attribute("ownerUserID", .stringAttributeType, optional: true)]
        saved.properties += [attribute("ownerUserID", .stringAttributeType, optional: true)]
        // IDs remain globally stable; a saved place source may exist as a local
        // draft and independently in more than one account cache.
        saved.uniquenessConstraints = [["id"], ["ownerUserID", "sourceKey"]]
        model.entities += [
            entity("SyncOutboxRecord", fields: [
                ("operationID", .UUIDAttributeType), ("userID", .stringAttributeType),
                ("recordType", .stringAttributeType), ("recordID", .stringAttributeType),
                ("expectedRevision", .integer64AttributeType), ("operationData", .binaryDataAttributeType),
                ("createdAt", .doubleAttributeType)
            ], unique: "operationID"),
            compoundEntity("SyncRecordStateRecord", fields: [
                ("userID", .stringAttributeType), ("recordType", .stringAttributeType),
                ("recordID", .stringAttributeType), ("revision", .integer64AttributeType),
                ("recordData", .binaryDataAttributeType), ("updatedAt", .doubleAttributeType)
            ], unique: [["userID", "recordType", "recordID"]]),
            compoundEntity("SyncConflictRecord", fields: [
                ("conflictID", .UUIDAttributeType), ("operationID", .UUIDAttributeType),
                ("userID", .stringAttributeType), ("localOperationData", .binaryDataAttributeType),
                ("serverRecordData", .binaryDataAttributeType), ("createdAt", .doubleAttributeType)
            ], unique: [["conflictID"], ["operationID"]])
        ]
        return model
    }

    private static func attribute(_ name: String, _ type: NSAttributeType, optional: Bool) -> NSAttributeDescription {
        let field = NSAttributeDescription()
        field.name = name; field.attributeType = type; field.isOptional = optional
        return field
    }

    private static func compoundEntity(
        _ name: String,
        fields: [(String, NSAttributeType)],
        unique constraints: [[String]]
    ) -> NSEntityDescription {
        let entity = NSEntityDescription(); entity.name = name; entity.managedObjectClassName = "NSManagedObject"
        entity.properties = fields.map { attribute($0.0, $0.1, optional: false) }
        entity.uniquenessConstraints = constraints
        return entity
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
        if syncV2.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) { return }
        guard let source = [original, stage2, current].first(where: { $0.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) }) else { throw TripError.invalidDocument }
        let recoveryBase = URL(fileURLWithPath: url.path + ".pre-import.sqlite")
        let recovery = FileManager.default.fileExists(atPath: recoveryBase.path) ? URL(fileURLWithPath: url.path + ".\(UUID().uuidString).pre-import.sqlite") : recoveryBase
        let destination = URL(fileURLWithPath: url.path + ".\(UUID().uuidString).migration.sqlite")
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: source)
        // SQLite-aware copy includes WAL content, unlike copying just the .sqlite file.
        try coordinator.replacePersistentStore(at: recovery, destinationOptions: nil, withPersistentStoreFrom: url, sourceOptions: nil, ofType: NSSQLiteStoreType)
        let entities = source.entities.compactMap(\.name)
        let originalFields = Dictionary(uniqueKeysWithValues: source.entities.compactMap { entity in
            entity.name.map { ($0, Array(entity.attributesByName.keys)) }
        })
        let before = try payloads(at: recovery, model: source, entities: entities, fields: originalFields)
        let mapping = try NSMappingModel.inferredMappingModel(forSourceModel: source, destinationModel: syncV2)
        let manager = NSMigrationManager(sourceModel: source, destinationModel: syncV2)
        try manager.migrateStore(from: recovery, sourceType: NSSQLiteStoreType, options: nil, with: mapping, toDestinationURL: destination, destinationType: NSSQLiteStoreType, destinationOptions: nil)
        guard try payloads(at: destination, model: syncV2, entities: entities, fields: originalFields) == before else { throw TripError.invalidDocument }
        let replacer = NSPersistentStoreCoordinator(managedObjectModel: syncV2)
        try replacer.replacePersistentStore(at: url, destinationOptions: nil, withPersistentStoreFrom: destination, sourceOptions: nil, ofType: NSSQLiteStoreType)
        guard try payloads(at: url, model: syncV2, entities: entities, fields: originalFields) == before else { throw TripError.invalidDocument }
        try? replacer.destroyPersistentStore(at: destination, ofType: NSSQLiteStoreType, options: nil)
        // recovery intentionally remains private and recoverable after a successful migration.
    }
    private static func payloads(at url: URL, model: NSManagedObjectModel, entities: [String], fields: [String: [String]]) throws -> [String: NSDictionary] {
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
                    guard let keys = fields[entity] else { throw TripError.invalidDocument }
                    result[key] = row.dictionaryWithValues(forKeys: keys) as NSDictionary
                }
            }
            return result
        }
    }
}
