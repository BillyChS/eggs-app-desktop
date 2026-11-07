using EggsApp.Api.Data;
using EggsApp.Tests.Infrastructure;

namespace EggsApp.Tests.Data;

public sealed class SqliteBackupTests : IDisposable
{
    private readonly TestDatabaseFolder _folder = new();

    public void Dispose() => _folder.Dispose();

    private string CopyPath => Path.Combine(_folder.Root, "copy.db");

    private void CreateDatabase(string value = "kept")
    {
        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(
            connection,
            $"PRAGMA journal_mode = WAL; CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('{value}');");
    }

    [Fact]
    public void Copy_IsAValidSelfContainedDatabase()
    {
        CreateDatabase();

        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);

        using var copy = _folder.Connect(CopyPath);
        Assert.Equal("kept", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));
        Assert.Equal("ok", TestDatabaseFolder.Scalar(copy, "PRAGMA integrity_check"));
        Assert.Equal("delete", TestDatabaseFolder.Scalar(copy, "PRAGMA journal_mode"));
        Assert.False(File.Exists(CopyPath + SqliteBackup.PartialExtension));
    }

    [Fact]
    public void Copy_IncludesCommittedDataStillInTheWal()
    {
        // Stays open with checkpoints off, so the row exists only in eggs.db-wal, as while the app runs.
        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(connection, "PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
        TestDatabaseFolder.Execute(connection, "CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('in the wal');");
        Assert.True(new FileInfo(_folder.DatabasePath + "-wal").Length > 0);

        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);

        using var copy = _folder.Connect(CopyPath);
        Assert.Equal("in the wal", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));
    }

    [Fact]
    public void Copy_ReplacesAnEarlierOne()
    {
        CreateDatabase("first");
        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);

        using (var connection = _folder.Connect())
        {
            TestDatabaseFolder.Execute(connection, "UPDATE Marker SET Value = 'second'");
        }

        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);

        using var copy = _folder.Connect(CopyPath);
        Assert.Equal("second", TestDatabaseFolder.Scalar(copy, "SELECT Value FROM Marker"));
    }

    [Fact]
    public void MissingDatabase_FailsWithoutCreatingOneOrACopy()
    {
        Assert.ThrowsAny<Exception>(() => SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath));

        Assert.False(File.Exists(_folder.DatabasePath));
        Assert.False(File.Exists(CopyPath));
        Assert.False(File.Exists(CopyPath + SqliteBackup.PartialExtension));
    }

    [Fact]
    public void FailedCopy_KeepsTheEarlierOne()
    {
        CreateDatabase();
        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);
        var earlier = File.ReadAllBytes(CopyPath);

        var garbage = new byte[8192];
        Array.Fill(garbage, (byte)'x');
        File.WriteAllBytes(_folder.DatabasePath, garbage);
        File.Delete(_folder.DatabasePath + "-wal");
        File.Delete(_folder.DatabasePath + "-shm");

        Assert.ThrowsAny<Exception>(() => SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath));

        Assert.Equal(earlier, File.ReadAllBytes(CopyPath));
        Assert.False(File.Exists(CopyPath + SqliteBackup.PartialExtension));
    }

    [Fact]
    public void CopyBackupFile_CopiesAndVerifies()
    {
        CreateDatabase();
        SqliteBackup.CopyDatabase(_folder.DatabasePath, CopyPath);
        var second = Path.Combine(_folder.Root, "second.db");

        SqliteBackup.CopyBackupFile(CopyPath, second);

        Assert.Equal(File.ReadAllBytes(CopyPath), File.ReadAllBytes(second));
    }

    [Fact]
    public void CopyBackupFile_OfACorruptFile_LeavesNothing()
    {
        var bad = Path.Combine(_folder.Root, "bad.db");
        File.WriteAllText(bad, "not a database at all, but long enough to look like something");
        var second = Path.Combine(_folder.Root, "second.db");

        Assert.Throws<InvalidDataException>(() => SqliteBackup.CopyBackupFile(bad, second));

        Assert.False(File.Exists(second));
        Assert.False(File.Exists(second + SqliteBackup.PartialExtension));
    }
}
