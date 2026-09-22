package com.travelplaner.nativepreview;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import java.io.*;
import java.util.UUID;

/** Test APK only. Java keeps its separate provider process independent of the target's Kotlin runtime. */
public final class BackupTestDocumentsProvider extends DocumentsProvider {
    private File folder() { File dir = new File(getContext().getCacheDir(), "picker-fixtures"); dir.mkdirs(); return dir; }
    @Override public boolean onCreate() { return true; }
    private void seed() {
        try {
            for (String name : new String[]{"legacy-trip-backup.json", "schedule-edit.json", "invalid-backup.json", "ios-export.json"}) {
                File file = new File(folder(), name);
                if (!file.exists()) try (InputStream in = getContext().getAssets().open(name); OutputStream out = new FileOutputStream(file)) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                }
            }
        } catch (IOException error) { throw new IllegalStateException(error); }
    }
    @Override public Cursor queryRoots(String[] projection) {
        MatrixCursor cursor = new MatrixCursor(projection != null ? projection : new String[]{Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_MIME_TYPES});
        cursor.newRow().add(Root.COLUMN_ROOT_ID, "test-root").add(Root.COLUMN_DOCUMENT_ID, "root").add(Root.COLUMN_TITLE, "TripPlot Test Files").add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE | Root.FLAG_LOCAL_ONLY).add(Root.COLUMN_MIME_TYPES, "application/json");
        return cursor;
    }
    private static final String[] COLUMNS = {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_FLAGS, Document.COLUMN_SIZE};
    private void row(MatrixCursor cursor, String id) {
        boolean root = id.equals("root");
        cursor.newRow().add(Document.COLUMN_DOCUMENT_ID, id).add(Document.COLUMN_DISPLAY_NAME, root ? "TripPlot Test Files" : id)
            .add(Document.COLUMN_MIME_TYPE, root ? Document.MIME_TYPE_DIR : "application/json")
            .add(Document.COLUMN_FLAGS, root ? Document.FLAG_DIR_SUPPORTS_CREATE : Document.FLAG_SUPPORTS_WRITE)
            .add(Document.COLUMN_SIZE, root ? 0 : new File(folder(), id).length());
    }
    @Override public Cursor queryDocument(String id, String[] projection) { MatrixCursor cursor = new MatrixCursor(projection != null ? projection : COLUMNS); row(cursor, id); return cursor; }
    @Override public Cursor queryChildDocuments(String parent, String[] projection, String sortOrder) {
        seed(); MatrixCursor cursor = new MatrixCursor(projection != null ? projection : COLUMNS);
        File[] files = folder().listFiles(); if (files != null) for (File file : files) row(cursor, file.getName());
        return cursor;
    }
    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException {
        if (id.contains("/") || id.equals("..")) throw new FileNotFoundException("Invalid document ID");
        seed(); return ParcelFileDescriptor.open(new File(folder(), id), ParcelFileDescriptor.parseMode(mode));
    }
    @Override public String createDocument(String parent, String mimeType, String displayName) throws FileNotFoundException {
        String safe = displayName.replace('/', '_').replace('\\', '_');
        String name = new File(folder(), safe).exists() ? UUID.randomUUID() + "-" + safe : safe;
        try { new File(folder(), name).createNewFile(); } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
        return name;
    }
}
