namespace EggsApp.Api.Features.Backups;

/// <summary>
/// What the footer shows. Times are local "YYYY-MM-DDTHH:mm:ss" with no offset, like every other date the UI gets.
/// </summary>
/// <param name="Enabled">False in the standalone API, which never makes backups: the footer then shows nothing.</param>
/// <param name="LastGoodAt">When the newest verified backup was made, or null if there is none.</param>
/// <param name="Warning">The last attempt failed, or the app was used on several days with no good backup.</param>
/// <param name="SecondCopy">Null when no second location is set up.</param>
public sealed record BackupStatusResponse(bool Enabled, string? LastGoodAt, bool Warning, SecondCopyStatus? SecondCopy);

public sealed record SecondCopyStatus(bool IsOneDrive, string? LastAt, bool Warning);
