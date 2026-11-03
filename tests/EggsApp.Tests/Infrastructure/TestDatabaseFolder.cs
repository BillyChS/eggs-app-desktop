using EggsApp.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Tests.Infrastructure;

/// <summary>
/// A temporary folder holding a real SQLite file, so WAL, the backup API and transactions behave as they do in the app.
/// </summary>
public sealed class TestDatabaseFolder : IDisposable
{
    public string Root { get; } = Directory.CreateTempSubdirectory("eggsapp-db-").FullName;

    public string DatabasePath => Path.Combine(Root, "eggs.db");

    public string BackupsFolder => Path.Combine(Root, "backups");

    public string[] Backups() =>
        Directory.Exists(BackupsFolder) ? Directory.GetFiles(BackupsFolder) : [];

    public DbContextOptions Options(Func<DateTime>? now = null)
    {
        var options = new DbContextOptionsBuilder();
        AppDbContext.Configure(options, DatabasePath, now);
        return options.Options;
    }

    /// <summary>An open connection that bypasses EF. Unpooled, so disposing it really releases the file.</summary>
    public SqliteConnection Connect(string? path = null)
    {
        var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder { DataSource = path ?? DatabasePath, Pooling = false }.ToString());

        connection.Open();
        return connection;
    }

    public static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    public static object? Scalar(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }

    public void Dispose()
    {
        // Pooled connections keep the file open, and Windows won't delete an open file.
        SqliteConnection.ClearAllPools();

        // WebApplicationFactory can dispose twice.
        if (Directory.Exists(Root))
        {
            Directory.Delete(Root, recursive: true);
        }
    }
}
