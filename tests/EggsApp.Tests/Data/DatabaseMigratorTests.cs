using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Tests.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace EggsApp.Tests.Data;

public sealed class DatabaseMigratorTests : IDisposable
{
    private readonly TestDatabaseFolder _folder = new();

    public void Dispose() => _folder.Dispose();

    private AppDbContext CreateContext() => new(_folder.Options());

    private async Task<DatabaseMigrationResult> MigrateWithRealContextAsync()
    {
        await using var db = CreateContext();
        return await DatabaseMigrator.MigrateAsync(db);
    }

    // An existing database that the real migrations have not been applied to, holding one row of data.
    private void CreateExistingDatabaseWithPendingMigrations()
    {
        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(connection, "CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('kept');");
    }

    [Fact]
    public async Task FreshDatabase_IsCreatedAndMigratedWithNoCopy()
    {
        var result = await MigrateWithRealContextAsync();

        Assert.True(File.Exists(_folder.DatabasePath));
        Assert.NotEmpty(result.AppliedMigrations);
        Assert.Null(result.BackupPath);
        Assert.Empty(_folder.Backups());

        await using var db = CreateContext();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Equal(result.AppliedMigrations, await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    public async Task FreshDatabase_CreatesMissingFolders()
    {
        var nested = Path.Combine(_folder.Root, "a", "b", "eggs.db");
        var options = new DbContextOptionsBuilder();
        AppDbContext.Configure(options, nested);

        await using var db = new AppDbContext(options.Options);
        await DatabaseMigrator.MigrateAsync(db);

        Assert.True(File.Exists(nested));
    }

    [Fact]
    public async Task ZeroByteFile_CountsAsFresh()
    {
        await File.WriteAllBytesAsync(_folder.DatabasePath, []);

        var result = await MigrateWithRealContextAsync();

        Assert.NotEmpty(result.AppliedMigrations);
        Assert.Empty(_folder.Backups());
    }

    [Fact]
    public async Task UpToDateDatabase_IsLeftAloneWithNoCopy()
    {
        await MigrateWithRealContextAsync();

        var result = await MigrateWithRealContextAsync();

        Assert.Empty(result.AppliedMigrations);
        Assert.Null(result.BackupPath);
        Assert.Empty(_folder.Backups());
    }

    [Fact]
    public async Task ExistingDatabaseWithPendingMigrations_IsCopiedFirst()
    {
        CreateExistingDatabaseWithPendingMigrations();

        var result = await MigrateWithRealContextAsync();

        Assert.NotEmpty(result.AppliedMigrations);
        var backup = Assert.Single(_folder.Backups());
        Assert.Equal(backup, result.BackupPath);
        Assert.Matches(@"eggs-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d-\d{3}\.db$", backup);

        using var copy = _folder.Connect(backup);
        Assert.Equal("kept", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));

        // Taken before migrating: the copy doesn't have the migration history.
        Assert.Null(TestDatabaseFolder.Scalar(
            copy,
            "SELECT name FROM sqlite_master WHERE name = '__EFMigrationsHistory'"));
    }

    // The real upgrade: a database a previous version of the app left behind, not one with no history at all.
    [Fact]
    public async Task DatabaseFromThePreviousVersion_IsCopiedAndGainsTheCustomersTable()
    {
        await using (var previous = CreateContext())
        {
            await previous.GetService<IMigrator>().MigrateAsync("Initial");
        }

        using (var connection = _folder.Connect())
        {
            TestDatabaseFolder.Execute(connection, "CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('kept');");
        }

        var result = await MigrateWithRealContextAsync();

        Assert.Contains(result.AppliedMigrations, migration => migration.EndsWith("_AddCustomers", StringComparison.Ordinal));
        Assert.DoesNotContain(result.AppliedMigrations, migration => migration.EndsWith("_Initial", StringComparison.Ordinal));

        const string HasCustomers = "SELECT name FROM sqlite_master WHERE name = 'Customers'";
        var backup = Assert.Single(_folder.Backups());

        using (var copy = _folder.Connect(backup))
        {
            Assert.Equal("kept", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));
            Assert.Null(TestDatabaseFolder.Scalar(copy, HasCustomers));
        }

        using (var migrated = _folder.Connect())
        {
            Assert.Equal("kept", TestDatabaseFolder.Scalar(migrated, "SELECT Value FROM Marker"));
            Assert.Equal("Customers", TestDatabaseFolder.Scalar(migrated, HasCustomers));
        }

        await using var db = CreateContext();
        db.Customers.Add(new Customer { Name = "María" });
        await db.SaveChangesAsync();
        Assert.Equal("María", (await db.Customers.SingleAsync()).Name);
    }

    [Fact]
    public async Task DatabaseWithCustomers_IsCopiedAndGainsTheSalesTablesKeepingTheCustomers()
    {
        await using (var previous = CreateContext())
        {
            await previous.GetService<IMigrator>().MigrateAsync("AddCustomers");
            previous.Customers.Add(new Customer { Name = "María" });
            await previous.SaveChangesAsync();
        }

        var result = await MigrateWithRealContextAsync();

        Assert.Collection(
            result.AppliedMigrations,
            applied => Assert.EndsWith("_AddSales", applied),
            applied => Assert.EndsWith("_AddCreditSales", applied));

        const string HasSales = "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('Sales', 'SaleItems')";
        var backup = Assert.Single(_folder.Backups());

        using (var copy = _folder.Connect(backup))
        {
            Assert.Equal("María", TestDatabaseFolder.Scalar(copy, "SELECT Name FROM Customers"));
            Assert.Equal(0L, TestDatabaseFolder.Scalar(copy, HasSales));
        }

        using var migrated = _folder.Connect();
        Assert.Equal("María", TestDatabaseFolder.Scalar(migrated, "SELECT Name FROM Customers"));
        Assert.Equal(2L, TestDatabaseFolder.Scalar(migrated, HasSales));
    }

    [Fact]
    public async Task DatabaseWithSales_KeepsThemAllAsCashSalesAndChecksCreditFromThenOn()
    {
        await using (var previous = CreateContext())
        {
            await previous.GetService<IMigrator>().MigrateAsync("AddSales");
        }

        // Raw SQL, because the current model has columns this schema doesn't have yet.
        using (var connection = _folder.Connect())
        {
            TestDatabaseFolder.Execute(
                connection,
                """
                INSERT INTO Customers (Id, Name, CreatedAt, UpdatedAt, IsDeleted)
                    VALUES ('c1', 'María', '2024-11-01 08:00:00', '2024-11-01 08:00:00', 0);
                INSERT INTO Sales (Id, SaleDate, Total, CreatedAt, UpdatedAt, IsDeleted) VALUES
                    ('s1', '2024-11-03', 3000, '2024-11-03 09:00:00', '2024-11-03 09:00:00', 0),
                    ('s2', '2024-11-04', 2000, '2024-11-04 09:00:00', '2024-11-04 09:00:00', 1);
                INSERT INTO SaleItems (Id, SaleId, Position, CartonType, Quantity, UnitPrice, LineTotal, CreatedAt,
                    UpdatedAt, IsDeleted) VALUES
                    ('i1', 's1', 0, 'A', 3, 1000, 3000, '2024-11-03 09:00:00', '2024-11-03 09:00:00', 0),
                    ('i2', 's2', 0, 'B', 1, 2000, 2000, '2024-11-04 09:00:00', '2024-11-04 09:00:00', 1);
                """);
        }

        var result = await MigrateWithRealContextAsync();

        Assert.EndsWith("_AddCreditSales", Assert.Single(result.AppliedMigrations));
        Assert.Single(_folder.Backups());

        using var migrated = _folder.Connect();
        TestDatabaseFolder.Execute(migrated, "PRAGMA foreign_keys = ON;");
        Assert.Equal("s1,2024-11-03,3000,0,,0|s2,2024-11-04,2000,0,,1", TestDatabaseFolder.Scalar(
            migrated,
            """
            SELECT group_concat(Id || ',' || SaleDate || ',' || Total || ',' || IsCredit || ',' ||
                ifnull(CustomerId, '') || ',' || IsDeleted, '|') FROM (SELECT * FROM Sales ORDER BY Id)
            """));
        Assert.Equal(2L, TestDatabaseFolder.Scalar(migrated, "SELECT COUNT(*) FROM SaleItems"));
        Assert.Equal("ok", TestDatabaseFolder.Scalar(migrated, "PRAGMA integrity_check"));
        Assert.Null(TestDatabaseFolder.Scalar(migrated, "PRAGMA foreign_key_check"));

        const string Insert =
            "INSERT INTO Sales (Id, SaleDate, Total, CreatedAt, UpdatedAt, IsDeleted, IsCredit, CustomerId) " +
            "VALUES ('{0}', '2024-11-05', 1000, '2024-11-05 09:00:00', '2024-11-05 09:00:00', 0, {1}, {2})";

        TestDatabaseFolder.Execute(migrated, string.Format(Insert, "ok", 1, "'c1'"));
        AssertRefused("CHECK", string.Format(Insert, "credit-alone", 1, "NULL"));
        AssertRefused("CHECK", string.Format(Insert, "cash-with-customer", 0, "'c1'"));
        AssertRefused("FOREIGN KEY", string.Format(Insert, "unknown-customer", 1, "'nobody'"));

        void AssertRefused(string constraint, string sql)
        {
            var exception = Assert.Throws<SqliteException>(() => TestDatabaseFolder.Execute(migrated, sql));
            Assert.Contains(constraint, exception.Message);
        }
    }

    [Fact]
    public async Task Copy_IncludesCommittedDataStillInTheWal()
    {
        // Stays open with checkpoints off, so the row exists only in eggs.db-wal, as it would after a crash.
        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(connection, "PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
        TestDatabaseFolder.Execute(connection, "CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('in the wal');");
        Assert.True(new FileInfo(_folder.DatabasePath + "-wal").Length > 0);

        await MigrateWithRealContextAsync();

        var backup = Assert.Single(_folder.Backups());
        using var copy = _folder.Connect(backup);
        Assert.Equal("in the wal", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));
    }

    [Fact]
    public async Task Pragmas_AreSetOnTheConnectionsTheAppUses()
    {
        await MigrateWithRealContextAsync();

        await using var db = CreateContext();
        await db.Database.OpenConnectionAsync();
        var connection = (SqliteConnection)db.Database.GetDbConnection();

        Assert.Equal("wal", TestDatabaseFolder.Scalar(connection, "PRAGMA journal_mode"));
        Assert.Equal(2L, TestDatabaseFolder.Scalar(connection, "PRAGMA synchronous")); // 2 is FULL.
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "PRAGMA foreign_keys"));
    }

    [Fact]
    public async Task AbandonedMigrationLock_DoesNotBlockTheNextStart()
    {
        CreateExistingDatabaseWithPendingMigrations();

        // Taken and never released, which is what a process killed mid-migration leaves behind.
        await using (var crashed = CreateContext())
        {
            await crashed.GetService<IHistoryRepository>().AcquireDatabaseLockAsync();
        }

        var result = await MigrateWithRealContextAsync().WaitAsync(TimeSpan.FromSeconds(20));

        Assert.NotEmpty(result.AppliedMigrations);
    }

    [Fact]
    public async Task NewerDatabase_IsRefusedAndUntouched()
    {
        await MigrateWithRealContextAsync();

        using (var connection = _folder.Connect())
        {
            TestDatabaseFolder.Execute(
                connection,
                "INSERT INTO __EFMigrationsHistory VALUES ('29990101000000_FromTheFuture', '10.0.0');");
        }

        var exception = await Assert.ThrowsAsync<DatabaseMigrationException>(MigrateWithRealContextAsync);

        Assert.Contains("newer than this version", exception.InnerException!.Message);
        Assert.Contains("29990101000000_FromTheFuture", exception.InnerException.Message);
        Assert.Empty(_folder.Backups());
    }

    [Fact]
    public async Task NotADatabase_FailsAndIsLeftAsItWas()
    {
        var garbage = new byte[8192];
        Array.Fill(garbage, (byte)'x');
        await File.WriteAllBytesAsync(_folder.DatabasePath, garbage);

        await Assert.ThrowsAsync<DatabaseMigrationException>(MigrateWithRealContextAsync);

        Assert.Equal(garbage, await File.ReadAllBytesAsync(_folder.DatabasePath));
        Assert.Empty(_folder.Backups());
    }

    [Fact]
    public async Task CopyFails_MigrationDoesNotRun()
    {
        CreateExistingDatabaseWithPendingMigrations();

        // A file where the backups folder should be.
        await File.WriteAllTextAsync(_folder.BackupsFolder, string.Empty);

        await Assert.ThrowsAsync<DatabaseMigrationException>(MigrateWithRealContextAsync);

        using var connection = _folder.Connect();
        Assert.Equal(0L, MigrationRowsIfAny(connection));
    }

    [Fact]
    public async Task MigrationThatFailsHalfway_RollsBackAndKeepsTheCopy()
    {
        CreateExistingDatabaseWithPendingMigrations();

        var options = new DbContextOptionsBuilder<FailingMigrationContext>();
        AppDbContext.Configure(options, _folder.DatabasePath);
        options.ConfigureWarnings(warnings => warnings.Ignore(RelationalEventId.ModelSnapshotNotFound));

        await using var db = new FailingMigrationContext(options.Options);
        var exception = await Assert.ThrowsAsync<DatabaseMigrationException>(() => DatabaseMigrator.MigrateAsync(db));

        var backup = Assert.Single(_folder.Backups());
        Assert.Contains(backup, exception.Message);

        using var connection = _folder.Connect();
        Assert.Null(TestDatabaseFolder.Scalar(
            connection,
            "SELECT name FROM sqlite_master WHERE name = 'HalfDone'"));
        Assert.Equal(0L, MigrationRowsIfAny(connection));
        Assert.Equal("kept", TestDatabaseFolder.Scalar(connection, "SELECT Value FROM Marker"));
    }

    private static long MigrationRowsIfAny(SqliteConnection connection)
    {
        var hasHistory = TestDatabaseFolder.Scalar(
            connection,
            "SELECT name FROM sqlite_master WHERE name = '__EFMigrationsHistory'") is not null;

        return hasHistory
            ? (long)TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM __EFMigrationsHistory")!
            : 0L;
    }

    public sealed class FailingMigrationContext(DbContextOptions options) : AppDbContext(options);

    [DbContext(typeof(FailingMigrationContext))]
    [Migration("20000101000000_FailsHalfway")]
    public sealed class FailsHalfway : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("CREATE TABLE HalfDone (Id INTEGER);");
            migrationBuilder.Sql("THIS IS NOT SQL;");
        }
    }
}
