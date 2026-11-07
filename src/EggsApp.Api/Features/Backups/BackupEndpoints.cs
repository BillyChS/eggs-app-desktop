namespace EggsApp.Api.Features.Backups;

public static class BackupEndpoints
{
    public static RouteGroupBuilder MapBackups(this RouteGroupBuilder api)
    {
        api.MapGet("/backups/status", (DatabaseBackups backups) => backups.GetStatus())
            .WithName("GetBackupStatus");

        // "Intentar de nuevo" in the footer's warning. Never fails with an error: the status says how it went.
        api.MapPost("/backups", async (DatabaseBackups backups) =>
            {
                if (!backups.Settings.Enabled)
                {
                    return Results.NotFound();
                }

                await backups.RunAsync(BackupReason.Requested);
                return Results.Ok(backups.GetStatus());
            })
            .WithName("RunBackup");

        return api;
    }
}
