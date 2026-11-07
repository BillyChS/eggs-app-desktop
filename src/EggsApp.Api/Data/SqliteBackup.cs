using Microsoft.Data.Sqlite;

namespace EggsApp.Api.Data;

/// <summary>
/// Copies of a SQLite file that are checked before they get their real name, so a file with that name is always a
/// complete, valid database.
/// </summary>
public static class SqliteBackup
{
    public const string PartialExtension = ".partial";

    /// <summary>
    /// Copies a live database with SQLite's backup API, never File.Copy: committed data can still be in its -wal
    /// file, after a crash or while the app runs. Replaces <paramref name="destinationPath"/> if it exists.
    /// </summary>
    /// <exception cref="InvalidDataException">The copy failed its integrity check; nothing was replaced.</exception>
    public static void CopyDatabase(string databasePath, string destinationPath)
    {
        var partialPath = destinationPath + PartialExtension;

        try
        {
            // ReadWrite, not ReadWriteCreate: a missing database must fail, not become an empty backup.
            using (var source = OpenUnpooled(databasePath, SqliteOpenMode.ReadWrite))
            using (var destination = OpenUnpooled(partialPath))
            {
                source.BackupDatabase(destination);

                // The copy inherits WAL mode. Rollback mode keeps it one self-contained file, which can be opened
                // read-only, synced, and restored without a -wal next to it. The app switches back at startup.
                using var command = destination.CreateCommand();
                command.CommandText = "PRAGMA journal_mode = DELETE;";
                command.ExecuteNonQuery();
            }

            Verify(partialPath);
            File.Move(partialPath, destinationPath, overwrite: true);
        }
        finally
        {
            File.Delete(partialPath);
        }
    }

    /// <summary>
    /// Copies a closed, already verified backup to another folder. A plain file copy is safe here, because nothing
    /// writes to a backup. Replaces <paramref name="destinationPath"/> if it exists.
    /// </summary>
    /// <exception cref="InvalidDataException">The copy failed its integrity check; nothing was replaced.</exception>
    public static void CopyBackupFile(string backupPath, string destinationPath)
    {
        var partialPath = destinationPath + PartialExtension;

        try
        {
            File.Copy(backupPath, partialPath, overwrite: true);
            Verify(partialPath);
            File.Move(partialPath, destinationPath, overwrite: true);
        }
        finally
        {
            File.Delete(partialPath);
        }
    }

    /// <exception cref="InvalidDataException">The file is not a valid SQLite database.</exception>
    public static void Verify(string path)
    {
        string? result;

        try
        {
            using var connection = OpenUnpooled(path, SqliteOpenMode.ReadOnly);
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA integrity_check;";
            result = command.ExecuteScalar() as string;
        }
        catch (SqliteException exception)
        {
            throw new InvalidDataException($"{path} is not a valid database: {exception.Message}", exception);
        }

        if (result != "ok")
        {
            throw new InvalidDataException($"{path} failed its integrity check: {result ?? "no result"}.");
        }
    }

    // Unpooled, so closing really releases the file.
    private static SqliteConnection OpenUnpooled(string path, SqliteOpenMode mode = SqliteOpenMode.ReadWriteCreate)
    {
        var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder { DataSource = path, Pooling = false, Mode = mode }.ToString());

        connection.Open();
        return connection;
    }
}
