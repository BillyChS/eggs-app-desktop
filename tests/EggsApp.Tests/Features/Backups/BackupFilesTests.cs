using EggsApp.Api.Data;
using EggsApp.Api.Features.Backups;

namespace EggsApp.Tests.Features.Backups;

public sealed class BackupFilesTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 11, 7, 18, 0, 0);

    private readonly string _folder = Directory.CreateTempSubdirectory("eggsapp-retention-").FullName;

    public void Dispose() => Directory.Delete(_folder, recursive: true);

    private string Touch(string name)
    {
        var path = Path.Combine(_folder, name);
        File.WriteAllText(path, name);
        return path;
    }

    private string[] Remaining() => Directory.GetFiles(_folder).Select(path => Path.GetFileName(path)).Order().ToArray();

    [Fact]
    public void Names_RoundTrip()
    {
        var name = BackupFiles.DailyName("eggs", new DateOnly(2026, 11, 7));

        Assert.Equal("eggs-2026-11-07.db", name);
        Assert.True(BackupFiles.TryParseDaily("eggs", name, out var day));
        Assert.Equal(new DateOnly(2026, 11, 7), day);
    }

    [Theory]
    [InlineData("eggs-2026-11-07.db.partial")]
    [InlineData("eggs-2026-13-07.db")]
    [InlineData("eggs.dev-2026-11-07.db")]
    [InlineData("eggs-2026-11-07_08-00-00-000.db")]
    [InlineData("mis-notas-2026-11-07.db")]
    public void OtherFiles_AreNotDailyBackups(string name) =>
        Assert.False(BackupFiles.TryParseDaily("eggs", name, out _));

    [Fact]
    public void KeepsTheNewest14Days()
    {
        var days = Enumerable.Range(0, 20).Select(offset => new DateOnly(2026, 11, 20).AddDays(-offset)).ToList();

        var keep = BackupFiles.DailyToKeepOf(days);

        // All 20 are in November, so the month adds nothing beyond its newest day, already kept.
        Assert.Equal(days.Take(14).ToHashSet(), keep);
    }

    [Fact]
    public void KeepsTheNewestOfEachOf12Months()
    {
        // Every day from 2025-01-01 to 2026-11-07.
        var days = Enumerable.Range(0, 676).Select(offset => new DateOnly(2025, 1, 1).AddDays(offset)).ToList();
        Assert.Equal(new DateOnly(2026, 11, 7), days[^1]);

        var keep = BackupFiles.DailyToKeepOf(days);

        var expectedMonthly = new[]
        {
            new DateOnly(2025, 12, 31), new DateOnly(2026, 1, 31), new DateOnly(2026, 2, 28), new DateOnly(2026, 3, 31),
            new DateOnly(2026, 4, 30), new DateOnly(2026, 5, 31), new DateOnly(2026, 6, 30), new DateOnly(2026, 7, 31),
            new DateOnly(2026, 8, 31), new DateOnly(2026, 9, 30), new DateOnly(2026, 10, 31),
        };

        // 14 days (Oct 25 â€“ Nov 7, which hold the newest of November and October) + 10 earlier month-ends.
        Assert.Equal(14 + 10, keep.Count);
        Assert.All(expectedMonthly, day => Assert.Contains(day, keep));
        Assert.DoesNotContain(new DateOnly(2025, 11, 30), keep);
    }

    [Fact]
    public void AnAppUnusedForMonths_KeepsItsOldBackups()
    {
        // Used in January only, then opened again in November.
        var days = Enumerable.Range(1, 20).Select(day => new DateOnly(2026, 1, day)).Append(new DateOnly(2026, 11, 7));

        var keep = BackupFiles.DailyToKeepOf(days);

        Assert.Contains(new DateOnly(2026, 11, 7), keep);
        Assert.Equal(13, keep.Count(day => day.Month == 1));
        Assert.Contains(new DateOnly(2026, 1, 20), keep);
    }

    [Fact]
    public void PruneDaily_DeletesOnlyOldDailyBackupsAndAbandonedPartials()
    {
        foreach (var offset in Enumerable.Range(0, 16))
        {
            Touch(BackupFiles.DailyName("eggs", new DateOnly(2026, 11, 7).AddDays(-offset)));
        }

        Touch("eggs.dev-2026-01-01.db");
        Touch("notas.txt");
        var oldPartial = Touch("eggs-2026-10-01.db" + SqliteBackup.PartialExtension);
        File.SetLastWriteTime(oldPartial, Now.AddDays(-2));
        Touch("eggs-2026-11-07.db" + SqliteBackup.PartialExtension);

        var deleted = BackupFiles.PruneDaily(_folder, "eggs", Now);

        // Oct 25 â€“ Nov 7 are the 14 newest, and October's newest (Oct 31) is among them.
        Assert.Equal(
            ["eggs-2026-10-01.db.partial", "eggs-2026-10-23.db", "eggs-2026-10-24.db"],
            deleted.Select(path => Path.GetFileName(path)).Order().ToArray());
        Assert.Contains("eggs-2026-10-25.db", Remaining());
        Assert.Contains("eggs.dev-2026-01-01.db", Remaining());
        Assert.Contains("notas.txt", Remaining());
        Assert.Contains("eggs-2026-11-07.db.partial", Remaining());
    }

    [Fact]
    public void PrunePreMigration_KeepsTheNewestFiveAndNothingElse()
    {
        foreach (var hour in Enumerable.Range(1, 8))
        {
            Touch($"eggs-2026-11-0{hour}_08-00-00-000.db");
        }

        Touch("eggs-2026-11-07.db");

        var deleted = BackupFiles.PrunePreMigration(_folder, "eggs", Now);

        Assert.Equal(
            ["eggs-2026-11-01_08-00-00-000.db", "eggs-2026-11-02_08-00-00-000.db", "eggs-2026-11-03_08-00-00-000.db"],
            deleted.Select(path => Path.GetFileName(path)).Order().ToArray());
        Assert.Contains("eggs-2026-11-07.db", Remaining());
        Assert.Equal(6, Remaining().Length);
    }

    [Fact]
    public void MissingFolder_PrunesNothing()
    {
        var missing = Path.Combine(_folder, "missing");

        Assert.Empty(BackupFiles.PruneDaily(missing, "eggs", Now));
        Assert.Empty(BackupFiles.PrunePreMigration(missing, "eggs", Now));
    }
}
