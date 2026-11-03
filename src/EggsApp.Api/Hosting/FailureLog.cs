using System.Globalization;
using System.Text;

namespace EggsApp.Api.Hosting;

/// <summary>
/// Writes failures, plus one line each for startup and clean shutdown, to one text file per day and keeps the
/// last <see cref="DaysToKeep"/> days.
/// Writing never throws: a logging problem must not take the app down or hide the original failure.
/// </summary>
public sealed class FailureLog(string directory, Func<DateTime>? now = null)
{
    public const int DaysToKeep = 7;

    // Bounds disk use if something fails in a loop. Later failures that day are dropped.
    public const long MaxFileBytes = 5 * 1024 * 1024;

    private const string FilePrefix = "eggsapp-";
    private const string FileExtension = ".log";
    private const string DateFormat = "yyyy-MM-dd";

    private readonly Func<DateTime> _now = now ?? (() => DateTime.Now);
    private readonly Lock _lock = new();
    private DateTime? _lastPrunedDay;

    public static FailureLog Default { get; } = new(AppDataPaths.Logs);

    public string Directory { get; } = directory;

    public void Write(string source, string message, Exception? exception = null)
    {
        try
        {
            var timestamp = _now();
            var entry = new StringBuilder()
                .Append(timestamp.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture))
                .Append(" [").Append(source).Append("] ").AppendLine(message);

            if (exception is not null)
            {
                entry.AppendLine(exception.ToString());
            }

            entry.AppendLine();

            lock (_lock)
            {
                System.IO.Directory.CreateDirectory(Directory);
                PruneOldFiles(timestamp.Date);
                Append(GetFilePath(timestamp), entry.ToString());
            }
        }
        catch (Exception)
        {
            // Nothing better can be done here: see the class summary.
        }
    }

    private string GetFilePath(DateTime timestamp) => Path.Combine(
        Directory,
        FilePrefix + timestamp.ToString(DateFormat, CultureInfo.InvariantCulture) + FileExtension);

    private static void Append(string path, string text)
    {
        // Shared access: a second instance failing at startup can write while the first has the file open.
        using var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);

        if (stream.Length >= MaxFileBytes)
        {
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(text);
        stream.Write(bytes);
    }

    private void PruneOldFiles(DateTime today)
    {
        if (_lastPrunedDay == today)
        {
            return;
        }

        _lastPrunedDay = today;
        var oldestKept = today.AddDays(-(DaysToKeep - 1));

        foreach (var path in System.IO.Directory.EnumerateFiles(Directory, FilePrefix + "*" + FileExtension))
        {
            var datePart = Path.GetFileNameWithoutExtension(path)[FilePrefix.Length..];
            var isDated = DateTime.TryParseExact(
                datePart, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var fileDay);

            if (isDated && fileDay < oldestKept)
            {
                File.Delete(path);
            }
        }
    }
}
