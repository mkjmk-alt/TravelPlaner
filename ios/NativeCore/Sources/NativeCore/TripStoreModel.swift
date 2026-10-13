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
    static var sync: NSManagedObjectModel {
        let model = current
        for name in ["TripRecord", "SavedPlaceRecord"] {
            guard let existing = model.entitiesByName[name] else { continue }
            let owner = NSAttributeDescription()
            owner.name = "ownerUserID"
            owner.attributeType = .stringAttributeType
            owner.isOptional = true
            existing.properties.append(owner)
        }
        model.entitiesByName["SavedPlaceRecord"]?.uniquenessConstraints = [["id"], ["ownerUserID", "sourceKey"]]
        model.entities += [
            entity("SyncOutboxRecord", fields: [("operationID", .stringAttributeType), ("userID", .stringAttributeType),
                ("recordType", .stringAttributeType), ("recordID", .stringAttributeType),
                ("expectedRevision", .integer64AttributeType), ("body", .binaryDataAttributeType), ("createdAt", .doubleAttributeType)], unique: "operationID"),
            entity("SyncRecordStateRecord", fields: [("userID", .stringAttributeType), ("recordType", .stringAttributeType),
                ("recordID", .stringAttributeType), ("revision", .integer64AttributeType), ("record", .binaryDataAttributeType),
                ("updatedAt", .doubleAttributeType), ("deletedAt", .doubleAttributeType)], unique: "userID",
                optional: ["deletedAt"], constraints: [["userID", "recordType", "recordID"]]),
            entity("SyncConflictRecord", fields: [("conflictID", .stringAttributeType), ("operationID", .stringAttributeType),
                ("userID", .stringAttributeType), ("operation", .binaryDataAttributeType),
                ("serverRecord", .binaryDataAttributeType), ("createdAt", .doubleAttributeType)], unique: "conflictID",
                constraints: [["conflictID"], ["operationID"]])
        ]
        return model
    }
    private static func entity(_ name: String, fields: [(String, NSAttributeType)], unique: String,
                               optional: Set<String> = [], constraints: [[String]]? = nil) -> NSEntityDescription {
        let entity = NSEntityDescription(); entity.name = name; entity.managedObjectClassName = "NSManagedObject"
        entity.properties = fields.map { name, type in
            let field = NSAttributeDescription(); field.name = name; field.attributeType = type
            field.isOptional = optional.contains(name); return field
        }
        entity.uniquenessConstraints = constraints ?? [[unique]]; return entity
    }
    static func migrateIfNeeded(at url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let metadata = try NSPersistentStoreCoordinator.metadataForPersistentStore(ofType: NSSQLiteStoreType, at: url, options: nil)
        if sync.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) { return }
        guard let source = [current, stage2, original].first(where: { $0.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata) }) else { throw TripError.invalidDocument }
        let recoveryBase = URL(fileURLWithPath: url.path + ".pre-import.sqlite")
        let recovery = FileManager.default.fileExists(atPath: recoveryBase.path) ? URL(fileURLWithPath: url.path + ".\(UUID().uuidString).pre-import.sqlite") : recoveryBase
        let destination = URL(fileURLWithPath: url.path + ".\(UUID().uuidString).migration.sqlite")
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: source)
        // SQLite-aware copy includes WAL content, unlike copying just the .sqlite file.
        try coordinator.replacePersistentStore(at: recovery, destinationOptions: nil, withPersistentStoreFrom: url, sourceOptions: nil, ofType: NSSQLiteStoreType)
        let entities = source.entities.compactMap(\.name)
        let before = try payloads(at: recovery, model: source, entities: entities)
        let destinationModel = sync
        let mapping = try NSMappingModel.inferredMappingModel(forSourceModel: source, destinationModel: destinationModel)
        let manager = NSMigrationManager(sourceModel: source, destinationModel: destinationModel)
        try manager.migrateStore(from: recovery, sourceType: NSSQLiteStoreType, options: nil, with: mapping, toDestinationURL: destination, destinationType: NSSQLiteStoreType, destinationOptions: nil)
        guard try payloads(at: destination, model: destinationModel, entities: entities, attributesFrom: source) == before else { throw TripError.invalidDocument }
        let replacer = NSPersistentStoreCoordinator(managedObjectModel: destinationModel)
        try replacer.replacePersistentStore(at: url, destinationOptions: nil, withPersistentStoreFrom: destination, sourceOptions: nil, ofType: NSSQLiteStoreType)
        guard try payloads(at: url, model: destinationModel, entities: entities, attributesFrom: source) == before else { throw TripError.invalidDocument }
        try? replacer.destroyPersistentStore(at: destination, ofType: NSSQLiteStoreType, options: nil)
        // recovery intentionally remains private and recoverable after a successful migration.
    }
    private static func payloads(at url: URL, model: NSManagedObjectModel, entities: [String],
                                 attributesFrom sourceModel: NSManagedObjectModel? = nil) throws -> [String: NSDictionary] {
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
                    let attributeEntity = sourceModel?.entitiesByName[entity] ?? row.entity
                    result[key] = row.dictionaryWithValues(forKeys: Array(attributeEntity.attributesByName.keys)) as NSDictionary
                }
            }
            return result
        }
    }
}
