using System.Globalization;
using System.Text.Json;
using EggsApp.Api.Data;
using EggsApp.Api.Hosting;

namespace EggsApp.Api.Features.Backups;

/// <summary>Why a backup was made, for the log.</summary>
public enum BackupReason
{
    NoneToday,
    Closing,
    Requested,
}

/// <summary>The local time, replaceable in tests.</summary>
public sealed class BackupClock(Func<DateTime>? now = null)
{
    private readonly Func<DateTime> _now = now ?? (() => DateTime.Now);

    public DateTime Now => _now();
}

/// <summary>
/// Makes the daily backups: a verified copy in backups\daily, then a copy of that in the second location.
/// Nothing here throws: a failed backup is logged and shown in the status, and must never stop the app.
/// Only one backup runs at a time.
/// </summary>
public sealed class DatabaseBackups
{
    /// <summary>Days the app was used with no good backup before the footer warns.</summary>
    public const int DaysOfUseBeforeWarning = 3;

    /// <summary>The same for the second location, which is less urgent.</summary>
    public const int DaysOfUseBeforeSecondCopyWarning = 7;

    public const string DailyFolder = "daily";
    public const string StateFileName = "backup-state.json";

    private const string LogSource = "Backup";
    private const string LocalDateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss";
    private const int UsageDaysKept = 60;
    private const int SecondCopyAttempts = 3;

    // OneDrive can hold a file open for a moment while it uploads it.
    private static readonly TimeSpan SecondCopyRetryDelay = TimeSpan.FromMilliseconds(500);

    private readonly SemaphoreSlim _running = new(1, 1);
    private readonly Lock _stateLock = new();
    private readonly FailureLog _log;
    private readonly BackupClock _clock;
    private readonly string _databasePath;
    private readonly string _stem;
    private readonly string _backupsFolder;
    private readonly string _dailyFolder;
    private readonly string _statePath;
    private readonly BackupState _state;
    private DateOnly? _secondSkipLoggedOn;
    private bool _stateSaveFailed;

    public DatabaseBackups(IConfiguration configuration, FailureLog log, BackupClock clock)
    {
        _log = log;
        _clock = clock;
        Settings = BackupSettings.FromConfiguration(configuration);

        _databasePath = Path.GetFullPath(
            configuration[EggsAppHostExtensions.DatabasePathKey] ?? AppDataPaths.DevDatabase);
        _stem = Path.GetFileNameWithoutExtension(_databasePath);
        _backupsFolder = Path.Combine(Path.GetDirectoryName(_databasePath)!, DatabaseMigrator.BackupsFolder);
        _dailyFolder = Path.Combine(_backupsFolder, DailyFolder);
        _statePath = Path.Combine(_backupsFolder, StateFileName);
        _state = LoadState();
    }

    public BackupSettings Settings { get; }

    /// <summary>
    /// For startup and the hourly check: counts today as a day of use, makes today's backup if there is none,
    /// and otherwise brings the second location up to date if an earlier copy there didn't happen.
    /// </summary>
    public async Task CheckAsync()
    {
        await _running.WaitAsync();

        try
        {
            var now = _clock.Now;
            var today = DateOnly.FromDateTime(now);
            RecordDayOfUse(today);

            if (!File.Exists(DailyPath(today)))
            {
                await BackUpAsync(now, BackupReason.NoneToday);
            }
            else
            {
                await CatchUpSecondCopyAsync(now);
            }
        }
        catch (Exception exception)
        {
            _log.Write(LogSource, "The backup check failed.", exception);
        }
        finally
        {
            SaveState();
            _running.Release();
        }
    }

    /// <summary>Makes a backup now, replacing today's.</summary>
    public async Task RunAsync(BackupReason reason)
    {
        await _running.WaitAsync();

        try
        {
            await BackUpAsync(_clock.Now, reason);
        }
        catch (Exception exception)
        {
            _log.Write(LogSource, "The backup failed unexpectedly.", exception);
        }
        finally
        {
            SaveState();
            _running.Release();
        }
    }

    public BackupStatusResponse GetStatus()
    {
        if (!Settings.Enabled)
        {
            return new BackupStatusResponse(Enabled: false, LastGoodAt: null, Warning: false, SecondCopy: null);
        }

        bool lastAttemptFailed;
        bool lastSecondCopyFailed;
        List<DateOnly> daysUsed;

        lock (_stateLock)
        {
            lastAttemptFailed = _state.LastAttemptFailed;
            lastSecondCopyFailed = _state.LastSecondCopyFailed;
            daysUsed = [.. _state.DaysUsed];
        }

        var local = Newest(_dailyFolder);
        var warning = lastAttemptFailed || DaysUsedSince(local?.Day) >= DaysOfUseBeforeWarning;

        SecondCopyStatus? secondCopy = null;

        if (Settings.Second is { } second)
        {
            var copy = Newest(second.Folder);
            secondCopy = new SecondCopyStatus(
                second.IsOneDrive,
                Format(copy?.Written),
                lastSecondCopyFailed || DaysUsedSince(copy?.Day) >= DaysOfUseBeforeSecondCopyWarning);
        }

        return new BackupStatusResponse(Enabled: true, Format(local?.Written), warning, secondCopy);

        int DaysUsedSince(DateOnly? lastGood) => daysUsed.Count(day => lastGood is null || day > lastGood);
    }

    private string DailyPath(DateOnly day) => Path.Combine(_dailyFolder, BackupFiles.DailyName(_stem, day));

    private async Task BackUpAsync(DateTime now, BackupReason reason)
    {
        var path = DailyPath(DateOnly.FromDateTime(now));

        try
        {
            Directory.CreateDirectory(_dailyFolder);
            SqliteBackup.CopyDatabase(_databasePath, path);
        }
        catch (Exception exception)
        {
            UpdateState(state => state.LastAttemptFailed = true);
            var lastGood = Newest(_dailyFolder)?.Path ?? "none";
            _log.Write(LogSource, $"Backup failed ({Describe(reason)}). Last good backup: {lastGood}.", exception);
            return;
        }

        UpdateState(state => state.LastAttemptFailed = false);
        var pruned = Prune(now);
        var second = await CopyToSecondAsync(path, now);

        _log.Write(
            LogSource,
            $"Backup made ({Describe(reason)}) and verified: {path}, {new FileInfo(path).Length} bytes. "
            + $"Old backups removed: {pruned}. Second copy: {second}.");
    }

    private async Task CatchUpSecondCopyAsync(DateTime now)
    {
        if (Settings.Second is not { } second || Newest(_dailyFolder) is not { } local)
        {
            return;
        }

        var copy = new FileInfo(Path.Combine(second.Folder, Path.GetFileName(local.Path)));
        var source = new FileInfo(local.Path);

        // File.Copy keeps the write time, so an up-to-date copy matches on both.
        if (copy.Exists && copy.Length == source.Length && copy.LastWriteTimeUtc == source.LastWriteTimeUtc)
        {
            return;
        }

        var result = await CopyToSecondAsync(local.Path, now);
        var today = DateOnly.FromDateTime(now);

        if (result.Kind != SecondCopyKind.Skipped || _secondSkipLoggedOn != today)
        {
            _secondSkipLoggedOn = result.Kind == SecondCopyKind.Skipped ? today : _secondSkipLoggedOn;
            _log.Write(LogSource, $"Second copy of {local.Path}: {result}.");
        }
    }

    private async Task<SecondCopyResult> CopyToSecondAsync(string localPath, DateTime now)
    {
        if (Settings.Second is not { } second)
        {
            return new SecondCopyResult(SecondCopyKind.NotSetUp, "none set up");
        }

        // A missing parent is OneDrive not set up on this account any more, or a USB drive that isn't plugged in:
        // not a failure, but the days of use without a copy still count toward the warning.
        var parent = Path.GetDirectoryName(second.Folder);

        if (!Directory.Exists(second.Folder) && (parent is null || !Directory.Exists(parent)))
        {
            UpdateState(state => state.LastSecondCopyFailed = false);
            return new SecondCopyResult(SecondCopyKind.Skipped, $"skipped, {second.Folder} isn't available");
        }

        var destination = Path.Combine(second.Folder, Path.GetFileName(localPath));

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                Directory.CreateDirectory(second.Folder);
                SqliteBackup.CopyBackupFile(localPath, destination);
                break;
            }
            catch (Exception) when (attempt < SecondCopyAttempts)
            {
                await Task.Delay(SecondCopyRetryDelay);
            }
            catch (Exception exception)
            {
                UpdateState(state => state.LastSecondCopyFailed = true);
                _log.Write(LogSource, $"Copying {localPath} to {second.Folder} failed.", exception);
                return new SecondCopyResult(SecondCopyKind.Failed, "failed, see the entry above");
            }
        }

        UpdateState(state => state.LastSecondCopyFailed = false);

        try
        {
            BackupFiles.PruneDaily(second.Folder, _stem, now);
        }
        catch (Exception exception)
        {
            _log.Write(LogSource, $"Removing old backups from {second.Folder} failed.", exception);
        }

        return new SecondCopyResult(SecondCopyKind.Copied, $"made and verified, {destination}");
    }

    private int Prune(DateTime now)
    {
        try
        {
            return BackupFiles.PruneDaily(_dailyFolder, _stem, now).Count
                + BackupFiles.PrunePreMigration(_backupsFolder, _stem, now).Count;
        }
        catch (Exception exception)
        {
            _log.Write(LogSource, "Removing old backups failed. The new one was kept.", exception);
            return 0;
        }
    }

    private (string Path, DateOnly Day, DateTime Written)? Newest(string folder)
    {
        try
        {
            return BackupFiles.ListDaily(folder, _stem) is [var newest, ..]
                ? (newest.Path, newest.Day, File.GetLastWriteTime(newest.Path))
                : null;
        }
        catch (Exception)
        {
            // An unreadable folder has no usable backups, and the status says so.
            return null;
        }
    }

    private static string? Format(DateTime? localTime) =>
        localTime?.ToString(LocalDateTimeFormat, CultureInfo.InvariantCulture);

    private static string Describe(BackupReason reason) => reason switch
    {
        BackupReason.NoneToday => "none yet today",
        BackupReason.Closing => "closing",
        BackupReason.Requested => "asked for",
        _ => reason.ToString(),
    };

    private void RecordDayOfUse(DateOnly today) => UpdateState(state =>
    {
        if (!state.DaysUsed.Contains(today))
        {
            state.DaysUsed.Add(today);
            state.DaysUsed.Sort();
        }

        if (state.DaysUsed.Count > UsageDaysKept)
        {
            state.DaysUsed.RemoveRange(0, state.DaysUsed.Count - UsageDaysKept);
        }
    });

    private void UpdateState(Action<BackupState> update)
    {
        lock (_stateLock)
        {
            update(_state);
        }
    }

    private BackupState LoadState()
    {
        try
        {
            return File.Exists(_statePath)
                ? JsonSerializer.Deserialize<BackupState>(File.ReadAllText(_statePath)) ?? new BackupState()
                : new BackupState();
        }
        catch (Exception exception)
        {
            _log.Write(LogSource, $"{_statePath} could not be read, so it starts over.", exception);
            return new BackupState();
        }
    }

    // Written whole to a temporary file first, so a crash can't leave half of it.
    private void SaveState()
    {
        try
        {
            string json;

            lock (_stateLock)
            {
                json = JsonSerializer.Serialize(_state);
            }

            Directory.CreateDirectory(_backupsFolder);
            File.WriteAllText(_statePath + SqliteBackup.PartialExtension, json);
            File.Move(_statePath + SqliteBackup.PartialExtension, _statePath, overwrite: true);
            _stateSaveFailed = false;
        }
        catch (Exception exception)
        {
            // Once, not every hour: the cause is almost always the one the backup itself already logged.
            if (!_stateSaveFailed)
            {
                _log.Write(LogSource, $"{_statePath} could not be saved.", exception);
            }

            _stateSaveFailed = true;
        }
    }

    /// <summary>What has to survive a restart for the warnings, in backups\backup-state.json.</summary>
    private sealed class BackupState
    {
        public bool LastAttemptFailed { get; set; }

        public bool LastSecondCopyFailed { get; set; }

        /// <summary>The days the app was open, so days it wasn't used don't count toward a warning.</summary>
        public List<DateOnly> DaysUsed { get; set; } = [];
    }

    private enum SecondCopyKind
    {
        NotSetUp,
        Skipped,
        Failed,
        Copied,
    }

    private sealed record SecondCopyResult(SecondCopyKind Kind, string Description)
    {
        public override string ToString() => Description;
    }
}
