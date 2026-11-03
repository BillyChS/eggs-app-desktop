using System.Globalization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Data;

/// <summary>What a startup did to the database.</summary>
public sealed record DatabaseMigrationResult(IReadOnlyList<string> AppliedMigrations, string? BackupPath);

/// <summary>
/// Brings the database up to date at startup, after copying any existing data.
/// </summary>
public static class DatabaseMigrator
{
    private const string BackupsFolder = "backups";

    /// <exception cref="DatabaseMigrationException">The database is not usable, so the app must not start.</exception>
    public static async Task<DatabaseMigrationResult> MigrateAsync(AppDbContext db)
    {
        var databasePath = new SqliteConnectionStringBuilder(db.Database.GetConnectionString()).DataSource;
        string? backupPath = null;

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);

            // Read first: anything that connects from here on creates the file.
            var hasData = new FileInfo(databasePath) is { Exists: true, Length: > 0 };

            var known = db.Database.GetMigrations().ToList();
            var applied = (await db.Database.GetAppliedMigrationsAsync()).ToList();

            // EF would ignore these and run against a schema this version doesn't understand.
            var unknown = applied.Except(known).ToList();

            if (unknown.Count > 0)
            {
                throw new InvalidOperationException(
                    $"The database is newer than this version of the app. Unknown migrations: {string.Join(", ", unknown)}.");
            }

            var pending = known.Except(applied).ToList();

            if (pending.Count > 0 && hasData)
            {
                backupPath = CopyDatabase(databasePath);
            }

            // Stored in the database file, so setting it once per startup is enough.
            await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode = WAL;");

            if (pending.Count > 0)
            {
                // EF waits forever on a lock left by a process killed mid-migration, which here would mean a window
                // stuck on "Abriendo…". Only one copy of the app runs at a time, so any lock found now is abandoned.
                await db.Database.ExecuteSqlRawAsync("DROP TABLE IF EXISTS \"__EFMigrationsLock\";");
                await db.Database.MigrateAsync();
            }

            return new DatabaseMigrationResult(pending, backupPath);
        }
        catch (Exception exception)
        {
            throw new DatabaseMigrationException(databasePath, backupPath, exception);
        }
    }

    // SQLite's backup API, not File.Copy: after a crash, committed data can still be in eggs.db-wal. The copy gets
    // its real name only once complete, so a file in the backups folder is never a partial one.
    private static string CopyDatabase(string databasePath)
    {
        var folder = Directory.CreateDirectory(
            Path.Combine(Path.GetDirectoryName(databasePath)!, BackupsFolder)).FullName;

        var timestamp = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss-fff", CultureInfo.InvariantCulture);
        var backupPath = Path.Combine(folder, $"{Path.GetFileNameWithoutExtension(databasePath)}-{timestamp}.db");
        var partialPath = backupPath + ".partial";

        try
        {
            using (var source = OpenUnpooled(databasePath))
            using (var destination = OpenUnpooled(partialPath))
            {
                source.BackupDatabase(destination);
            }

            File.Move(partialPath, backupPath);
            return backupPath;
        }
        finally
        {
            File.Delete(partialPath);
        }
    }

    // Unpooled, so closing really releases the file.
    private static SqliteConnection OpenUnpooled(string path)
    {
        var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString());

        connection.Open();
        return connection;
    }
}
