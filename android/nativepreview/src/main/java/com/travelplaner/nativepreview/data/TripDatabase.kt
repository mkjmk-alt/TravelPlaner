package com.travelplaner.nativepreview.data

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "trips")
data class TripEntity(@PrimaryKey val id: String, val json: String, val updatedAt: Long)

@Entity(tableName = "import_receipts")
data class ImportReceiptEntity(@PrimaryKey val sourceHash: String, val sourceBytes: ByteArray, val targetID: String, val previousTargetIDs: String, val importedAt: Long)

@Dao
interface ImportReceiptDao {
    @Query("SELECT * FROM import_receipts WHERE sourceHash = :hash")
    suspend fun find(hash: String): ImportReceiptEntity?
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(receipt: ImportReceiptEntity)
    @Update
    suspend fun update(receipt: ImportReceiptEntity): Int
}

@Dao
interface TripDao {
    @Query("SELECT * FROM trips ORDER BY updatedAt DESC, id ASC")
    suspend fun list(): List<TripEntity>

    @Query("SELECT * FROM trips WHERE id = :id")
    suspend fun find(id: String): TripEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(trip: TripEntity)

    @Update
    suspend fun update(trip: TripEntity): Int

    @Query("DELETE FROM trips WHERE id = :id")
    suspend fun delete(id: String)
}

@Entity(tableName = "saved_places", indices = [Index(value = ["sourceKey"], unique = true)])
data class SavedPlaceEntity(@PrimaryKey val id: String, val sourceKey: String, val payload: String, val createdAt: Long, val updatedAt: Long)
@Dao
interface SavedPlaceDao {
    @Query("SELECT * FROM saved_places ORDER BY updatedAt DESC, id ASC")
    suspend fun list(): List<SavedPlaceEntity>
    @Query("SELECT * FROM saved_places WHERE id = :id")
    suspend fun find(id: String): SavedPlaceEntity?
    @Query("SELECT * FROM saved_places WHERE sourceKey = :key")
    suspend fun findSource(key: String): SavedPlaceEntity?
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(place: SavedPlaceEntity)
    @Query("DELETE FROM saved_places WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(entities = [TripEntity::class, ImportReceiptEntity::class, SavedPlaceEntity::class], version = 3, exportSchema = true)
abstract class TripDatabase : RoomDatabase() {
    abstract fun trips(): TripDao
    abstract fun receipts(): ImportReceiptDao
    abstract fun savedPlaces(): SavedPlaceDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS saved_places (id TEXT NOT NULL, sourceKey TEXT NOT NULL, payload TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, PRIMARY KEY(id))")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_saved_places_sourceKey ON saved_places(sourceKey)")
            }
        }
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `import_receipts` (`sourceHash` TEXT NOT NULL, `sourceBytes` BLOB NOT NULL, `targetID` TEXT NOT NULL, `previousTargetIDs` TEXT NOT NULL, `importedAt` INTEGER NOT NULL, PRIMARY KEY(`sourceHash`))")
            }
        }
        fun open(context: Context, name: String = "tripplot-native.db"): TripDatabase =
            Room.databaseBuilder(context.applicationContext, TripDatabase::class.java, name).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build()
        // No destructive migration or read-failure fallback: originals must remain recoverable.
    }
}
