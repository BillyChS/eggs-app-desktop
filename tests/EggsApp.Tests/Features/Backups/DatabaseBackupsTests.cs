using EggsApp.Api;
using EggsApp.Api.Features.Backups;
using EggsApp.Api.Hosting;
using EggsApp.Tests.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace EggsApp.Tests.Features.Backups;

public sealed class DatabaseBackupsTests : IDisposable
{
    private readonly TestDatabaseFolder _folder = new();
    private readonly FailureLog _log;
    private DateTime _now = new(2026, 11, 7, 8, 15, 0);

    public DatabaseBackupsTests()
    {
        _log = new FailureLog(Path.Combine(_folder.Root, "logs"));

        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(
            connection,
            "PRAGMA journal_mode = WAL; CREATE TABLE Marker (Value TEXT); INSERT INTO Marker VALUES ('kept');");
    }

    public void Dispose() => _folder.Dispose();

    private string DailyFolder => Path.Combine(_folder.BackupsFolder, DatabaseBackups.DailyFolder);

    private string SecondFolder => Path.Combine(_folder.Root, "OneDrive", BackupSettings.OneDriveSubfolder);

    private string Daily(DateOnly day) => Path.Combine(DailyFolder, BackupFiles.DailyName("eggs", day));

    private DateOnly Today => DateOnly.FromDateTime(_now);

    private string ReadLog() =>
        Directory.Exists(_log.Directory) ? string.Concat(Directory.GetFiles(_log.Directory).Select(File.ReadAllText)) : "";

    /// <summary>By default the second location is a fake OneDrive folder inside the test's own temporary folder.</summary>
    private DatabaseBackups Create(string? secondFolder = null, bool oneDriveExists = true)
    {
        var oneDrive = Path.Combine(_folder.Root, "OneDrive");

        if (oneDriveExists)
        {
            Directory.CreateDirectory(oneDrive);
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [EggsAppHostExtensions.DatabasePathKey] = _folder.DatabasePath,
                [BackupSettings.EnabledKey] = "true",
                [BackupSettings.SecondFolderKey] = secondFolder,
                [BackupSettings.OneDriveKey] = oneDrive,
            })
            .Build();

        return new DatabaseBackups(configuration, _log, new BackupClock(() => _now));
    }

    private void SetMarker(string value)
    {
        using var connection = _folder.Connect();
        TestDatabaseFolder.Execute(connection, $"UPDATE Marker SET Value = '{value}'");
    }

    private string? MarkerIn(string path)
    {
        using var connection = _folder.Connect(path);
        return TestDatabaseFolder.Scalar(connection, "SELECT Value FROM Marker") as string;
    }

    // The backups folder can't be created where a file has its name.
    private void BreakLocalBackups()
    {
        Directory.CreateDirectory(_folder.BackupsFolder);
        File.WriteAllText(DailyFolder, "");
    }

    [Fact]
    public async Task Check_MakesTodaysBackupInBothPlacesAndLogsIt()
    {
        var backups = Create();

        await backups.CheckAsync();

        Assert.Equal("kept", MarkerIn(Daily(Today)));
        var second = Path.Combine(SecondFolder, "eggs-2026-11-07.db");
        Assert.Equal(File.ReadAllBytes(Daily(Today)), File.ReadAllBytes(second));
        Assert.Contains("Backup made (none yet today) and verified", ReadLog());

        var status = backups.GetStatus();
        Assert.True(status.Enabled);
        Assert.False(status.Warning);
        Assert.Matches(@"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$", status.LastGoodAt!);
        Assert.Equal(new SecondCopyStatus(IsOneDrive: true, status.LastGoodAt, Warning: false), status.SecondCopy);
    }

    [Fact]
    public async Task Check_WhenTodaysBackupExists_LeavesItAlone()
    {
        var backups = Create();
        await backups.CheckAsync();
        SetMarker("changed");

        await backups.CheckAsync();

        Assert.Equal("kept", MarkerIn(Daily(Today)));
    }

    [Fact]
    public async Task Check_OnANewDay_MakesThatDaysBackup()
    {
        var backups = Create();
        await backups.CheckAsync();
        SetMarker("next day");

        _now = _now.AddDays(1).Date.AddMinutes(5);
        await backups.CheckAsync();

        Assert.Equal("kept", MarkerIn(Daily(Today.AddDays(-1))));
        Assert.Equal("next day", MarkerIn(Daily(Today)));
    }

    [Fact]
    public async Task Run_ReplacesTodaysBackupWithTheLatestData()
    {
        var backups = Create();
        await backups.CheckAsync();
        SetMarker("at closing");

        await backups.RunAsync(BackupReason.Closing);

        Assert.Equal("at closing", MarkerIn(Daily(Today)));
        Assert.Equal("at closing", MarkerIn(Path.Combine(SecondFolder, "eggs-2026-11-07.db")));
        Assert.Contains("Backup made (closing)", ReadLog());
    }

    [Fact]
    public async Task Run_PrunesOldBackupsAndPreMigrationCopies()
    {
        Directory.CreateDirectory(DailyFolder);

        foreach (var offset in Enumerable.Range(1, 20))
        {
            File.WriteAllText(Daily(new DateOnly(2026, 11, 7).AddDays(-offset)), "");
        }

        foreach (var day in Enumerable.Range(1, 7))
        {
            File.WriteAllText(Path.Combine(_folder.BackupsFolder, $"eggs-2026-10-0{day}_09-00-00-000.db"), "");
        }

        await Create().RunAsync(BackupReason.Requested);

        // Today plus 13 earlier days, and October's newest is among them.
        Assert.Equal(14, Directory.GetFiles(DailyFolder).Length);
        Assert.Equal(5, Directory.GetFiles(_folder.BackupsFolder, "eggs-2026-10-*.db").Length);
        Assert.Contains("Old backups removed: 9.", ReadLog());
    }

    [Fact]
    public async Task Failure_DoesNotThrowAndIsLoggedAndWarnsAtOnce()
    {
        BreakLocalBackups();
        var backups = Create();

        await backups.CheckAsync();
        await backups.RunAsync(BackupReason.Requested);

        Assert.Contains("Backup failed (none yet today)", ReadLog());
        Assert.Contains("Backup failed (asked for)", ReadLog());
        var status = backups.GetStatus();
        Assert.True(status.Warning);
        Assert.Null(status.LastGoodAt);
    }

    [Fact]
    public async Task Failure_IsRememberedAfterARestart_AndASuccessClearsIt()
    {
        await Create().CheckAsync();
        File.Delete(_folder.DatabasePath + "-wal");
        File.Delete(_folder.DatabasePath + "-shm");
        File.Move(_folder.DatabasePath, _folder.DatabasePath + ".moved");

        _now = _now.AddDays(1);
        await Create().CheckAsync();

        // A new instance, like the next launch, before its own check has run.
        Assert.True(Create().GetStatus().Warning);

        File.Move(_folder.DatabasePath + ".moved", _folder.DatabasePath);
        var restarted = Create();
        await restarted.RunAsync(BackupReason.Requested);

        Assert.False(restarted.GetStatus().Warning);
    }

    [Fact]
    public async Task DaysTheAppWasNotOpened_DoNotCountTowardTheWarning()
    {
        await Create().CheckAsync();

        // A long weekend: the next launch is four days later, before its startup backup has finished.
        _now = _now.AddDays(4);

        Assert.False(Create().GetStatus().Warning);
    }

    [Fact]
    public async Task ThreeDaysOfUseWithoutAGoodBackup_Warn()
    {
        await Create().CheckAsync();

        // Days of use whose backups never finished, as if the app were killed each time.
        var backups = Create();
        _now = _now.AddDays(2);
        await backups.CheckAsync();
        File.Delete(Daily(Today));
        _now = _now.AddDays(1);
        await backups.CheckAsync();
        File.Delete(Daily(Today));

        Assert.False(backups.GetStatus().Warning);

        _now = _now.AddDays(3);
        await backups.CheckAsync();
        File.Delete(Daily(Today));

        var status = backups.GetStatus();
        Assert.True(status.Warning);
        Assert.StartsWith("2026-11-07T", status.LastGoodAt);
    }

    [Fact]
    public async Task MissingOneDrive_IsSkippedQuietly_AndWarnsOnlyAfterSevenDaysOfUse()
    {
        DatabaseBackups backups;

        for (var day = 1; day < DatabaseBackups.DaysOfUseBeforeSecondCopyWarning; day++)
        {
            backups = Create(oneDriveExists: false);
            await backups.CheckAsync();

            var status = backups.GetStatus();
            Assert.False(status.Warning);
            Assert.False(status.SecondCopy!.Warning, $"Warned after {day} days of use.");
            Assert.Null(status.SecondCopy.LastAt);

            // Even with days in between that the app wasn't used.
            _now = _now.AddDays(2);
        }

        Assert.Contains("skipped", ReadLog());
        Assert.DoesNotContain("failed", ReadLog(), StringComparison.OrdinalIgnoreCase);

        backups = Create(oneDriveExists: false);
        await backups.CheckAsync();

        Assert.True(backups.GetStatus().SecondCopy!.Warning);
        Assert.False(backups.GetStatus().Warning);
    }

    [Fact]
    public async Task SecondCopyThatFails_WarnsAtOnce_AndIsRetriedByTheNextCheck()
    {
        // A file where the OneDrive subfolder should be: its parent exists, so this is a failure, not a skip.
        Directory.CreateDirectory(Path.GetDirectoryName(SecondFolder)!);
        File.WriteAllText(SecondFolder, "");
        var backups = Create();

        await backups.CheckAsync();

        Assert.True(backups.GetStatus().SecondCopy!.Warning);
        Assert.False(backups.GetStatus().Warning);
        Assert.True(File.Exists(Daily(Today)));

        File.Delete(SecondFolder);
        await backups.CheckAsync();

        Assert.True(File.Exists(Path.Combine(SecondFolder, "eggs-2026-11-07.db")));
        Assert.False(backups.GetStatus().SecondCopy!.Warning);
    }

    [Fact]
    public async Task ConfiguredFolder_IsUsedInsteadOfOneDrive()
    {
        var usb = Path.Combine(_folder.Root, "E", "Respaldos");
        Directory.CreateDirectory(Path.GetDirectoryName(usb)!);
        var backups = Create(secondFolder: usb);

        await backups.CheckAsync();

        Assert.True(File.Exists(Path.Combine(usb, "eggs-2026-11-07.db")));
        Assert.False(Directory.Exists(SecondFolder));
        Assert.False(backups.GetStatus().SecondCopy!.IsOneDrive);
    }

    [Fact]
    public async Task UnpluggedUsbDrive_IsSkipped()
    {
        var usb = Path.Combine(_folder.Root, "not-plugged-in", "Respaldos");
        var backups = Create(secondFolder: usb);

        await backups.CheckAsync();

        Assert.True(File.Exists(Daily(Today)));
        Assert.False(Directory.Exists(usb));
        Assert.False(backups.GetStatus().SecondCopy!.Warning);
    }

    [Fact]
    public async Task Off_MeansNoSecondCopy()
    {
        var backups = Create(secondFolder: "OFF");

        await backups.CheckAsync();

        Assert.False(Directory.Exists(SecondFolder));
        Assert.Null(backups.GetStatus().SecondCopy);
    }

    [Fact]
    public void NoOneDriveAndNothingConfigured_MeansNoSecondLocation()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { [BackupSettings.EnabledKey] = "true" })
            .Build();

        Assert.Null(BackupSettings.FromConfiguration(configuration).Second);
    }

    [Fact]
    public void Disabled_ReportsNothing()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [EggsAppHostExtensions.DatabasePathKey] = _folder.DatabasePath,
            })
            .Build();

        var backups = new DatabaseBackups(configuration, _log, new BackupClock());

        Assert.Equal(new BackupStatusResponse(false, null, false, null), backups.GetStatus());
    }
}
