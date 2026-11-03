using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace EggsApp.Api.Data;

/// <summary>
/// Applies the per-connection settings. FULL waits for the disk on every commit, so a power cut can't lose a saved
/// sale. NORMAL is the usual choice with WAL, but its speed gain doesn't matter for one person's data entry.
/// </summary>
internal sealed class SqlitePragmaInterceptor : DbConnectionInterceptor
{
    private const string Pragmas = "PRAGMA synchronous = FULL;";

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var command = connection.CreateCommand();
        command.CommandText = Pragmas;
        command.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = Pragmas;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
