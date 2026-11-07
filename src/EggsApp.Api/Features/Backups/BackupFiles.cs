using System.Globalization;
using System.Text.RegularExpressions;
using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Backups;

/// <summary>
/// Names of the backup files and which of them to keep. Pruning only ever deletes files whose names match these
/// exact patterns, so nothing else in a folder (like the user's own files in OneDrive) can be touched.
/// </summary>
public static class BackupFiles
{
    public const int DailyToKeep = 14;
    public const int MonthsToKeep = 12;
    public const int PreMigrationToKeep = 5;

    private const string DayFormat = "yyyy-MM-dd";

    // A .partial that old is left from a process that was killed mid-copy.
    private static readonly TimeSpan AbandonedPartialAge = TimeSpan.FromDays(1);

    /// <summary>"eggs-2026-11-07.db": one per day, replaced by a later backup the same day.</summary>
    public static string DailyName(string stem, DateOnly day) =>
        $"{stem}-{day.ToString(DayFormat, CultureInfo.InvariantCulture)}.db";

    public static bool TryParseDaily(string stem, string fileName, out DateOnly day)
    {
        day = default;
        var match = Regex.Match(fileName, $@"^{Regex.Escape(stem)}-(\d{{4}}-\d\d-\d\d)\.db$");

        return match.Success && DateOnly.TryParseExact(
            match.Groups[1].Value, DayFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out day);
    }

    public static bool TryParsePreMigration(string stem, string fileName, out DateTime taken)
    {
        taken = default;
        var match = Regex.Match(fileName, $@"^{Regex.Escape(stem)}-(\d{{4}}-\d\d-\d\d_\d\d-\d\d-\d\d-\d{{3}})\.db$");

        return match.Success && DateTime.TryParseExact(
            match.Groups[1].Value,
            DatabaseMigrator.PreMigrationTimestampFormat,
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out taken);
    }

    /// <summary>
    /// The <see cref="DailyToKeep"/> newest days, plus the newest day of each of the <see cref="MonthsToKeep"/>
    /// newest months. Counted in backups, not calendar days, so an app left unused for weeks keeps its old ones.
    /// </summary>
    public static IReadOnlySet<DateOnly> DailyToKeepOf(IEnumerable<DateOnly> days)
    {
        var newestFirst = days.Distinct().OrderDescending().ToList();
        var keep = newestFirst.Take(DailyToKeep).ToHashSet();

        keep.UnionWith(newestFirst
            .GroupBy(day => (day.Year, day.Month))
            .Take(MonthsToKeep)
            .Select(month => month.First()));

        return keep;
    }

    /// <summary>The daily backups in a folder, newest first.</summary>
    public static IReadOnlyList<(string Path, DateOnly Day)> ListDaily(string folder, string stem)
    {
        if (!Directory.Exists(folder))
        {
            return [];
        }

        return Directory.EnumerateFiles(folder, stem + "-*.db")
            .Select(path => (Path: path, Ok: TryParseDaily(stem, Path.GetFileName(path), out var day), Day: day))
            .Where(file => file.Ok)
            .OrderByDescending(file => file.Day)
            .Select(file => (file.Path, file.Day))
            .ToList();
    }

    /// <returns>The files deleted.</returns>
    public static IReadOnlyList<string> PruneDaily(string folder, string stem, DateTime now)
    {
        if (!Directory.Exists(folder))
        {
            return [];
        }

        var daily = ListDaily(folder, stem);
        var keep = DailyToKeepOf(daily.Select(file => file.Day));

        var deleted = daily.Where(file => !keep.Contains(file.Day)).Select(file => file.Path).ToList();
        deleted.ForEach(File.Delete);
        deleted.AddRange(PruneAbandonedPartials(folder, stem, now));

        return deleted;
    }

    /// <returns>The files deleted.</returns>
    public static IReadOnlyList<string> PrunePreMigration(string folder, string stem, DateTime now)
    {
        if (!Directory.Exists(folder))
        {
            return [];
        }

        var deleted = Directory.EnumerateFiles(folder, stem + "-*.db")
            .Select(path => (Path: path, Ok: TryParsePreMigration(stem, Path.GetFileName(path), out var taken), Taken: taken))
            .Where(file => file.Ok)
            .OrderByDescending(file => file.Taken)
            .Skip(PreMigrationToKeep)
            .Select(file => file.Path)
            .ToList();

        deleted.ForEach(File.Delete);
        deleted.AddRange(PruneAbandonedPartials(folder, stem, now));

        return deleted;
    }

    private static List<string> PruneAbandonedPartials(string folder, string stem, DateTime now)
    {
        var abandoned = Directory.EnumerateFiles(folder, stem + "-*.db" + SqliteBackup.PartialExtension)
            .Where(path => now - File.GetLastWriteTime(path) > AbandonedPartialAge)
            .ToList();

        abandoned.ForEach(File.Delete);
        return abandoned;
    }
}
