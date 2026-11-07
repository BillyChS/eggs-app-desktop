namespace EggsApp.Api.Features.Backups;

/// <summary>A folder off this disk that gets a copy of every backup.</summary>
/// <param name="IsOneDrive">The default location, as opposed to one set in settings.json.</param>
public sealed record SecondLocation(string Folder, bool IsOneDrive);

/// <summary>How backups run. Read from configuration: see <see cref="FromConfiguration"/>.</summary>
public sealed record BackupSettings(bool Enabled, SecondLocation? Second, TimeSpan CheckInterval)
{
    public const string EnabledKey = "Backup:Enabled";
    public const string SecondFolderKey = "Backup:SecondFolder";
    public const string CheckIntervalKey = "Backup:CheckInterval";

    /// <summary>Set by OneDrive for the signed-in user, and read from the environment like any setting.</summary>
    public const string OneDriveKey = "OneDrive";

    public const string OneDriveSubfolder = "Respaldos Eggs App";

    /// <summary>Turns the second location off.</summary>
    public const string Off = "off";

    public static readonly TimeSpan DefaultCheckInterval = TimeSpan.FromHours(1);

    /// <summary>
    /// Backups are off unless <c>Backup:Enabled</c> is true, which only the desktop host sets, so the standalone API
    /// and the tests never write any. The second location is <c>Backup:SecondFolder</c>: a path, or "off". Unset, it
    /// is a folder in the user's OneDrive when OneDrive is set up, and there is none otherwise.
    /// </summary>
    public static BackupSettings FromConfiguration(IConfiguration configuration)
    {
        var configured = configuration[SecondFolderKey]?.Trim();
        var oneDrive = configuration[OneDriveKey]?.Trim();

        var second = configured switch
        {
            _ when string.Equals(configured, Off, StringComparison.OrdinalIgnoreCase) => null,
            { Length: > 0 } => new SecondLocation(Path.GetFullPath(configured), IsOneDrive: false),
            _ when !string.IsNullOrEmpty(oneDrive) =>
                new SecondLocation(Path.Combine(oneDrive, OneDriveSubfolder), IsOneDrive: true),
            _ => null,
        };

        return new BackupSettings(
            configuration.GetValue<bool>(EnabledKey),
            second,
            configuration.GetValue<TimeSpan?>(CheckIntervalKey) ?? DefaultCheckInterval);
    }
}
