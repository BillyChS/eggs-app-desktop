namespace EggsApp.Api.Data;

/// <summary>
/// The database could not be brought up to date, so the app must not start.
/// </summary>
public sealed class DatabaseMigrationException(string databasePath, string? backupPath, Exception innerException)
    : Exception(
        $"Could not prepare the database at {databasePath}. Copy made before migrating: {backupPath ?? "none"}.",
        innerException)
{
}
