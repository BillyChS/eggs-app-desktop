namespace EggsApp.Api.Features.Backups;

/// <summary>
/// Checks once at startup and then every hour, so an app left open past midnight still gets that day's backup.
/// The backup on closing is made by the host once it has stopped taking requests (EmbeddedApiHost.DisposeAsync).
/// </summary>
public sealed class BackupWorker(DatabaseBackups backups) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!backups.Settings.Enabled)
        {
            return;
        }

        // Off the startup path: the window must not wait for a backup.
        await Task.Yield();
        await backups.CheckAsync();

        using var timer = new PeriodicTimer(backups.Settings.CheckInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await backups.CheckAsync();
            }
        }
        catch (OperationCanceledException)
        {
            // The host is stopping.
        }
    }
}
