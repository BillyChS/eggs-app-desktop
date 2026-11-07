using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Backups;
using EggsApp.Tests.Infrastructure;

namespace EggsApp.Tests.Features.Backups;

// The standalone API never makes backups, so development can't fill the real backup folders. The desktop host's
// side is in EmbeddedApiHostTests.
public sealed class BackupEndpointsTests : IDisposable
{
    private readonly EggsAppFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task StandaloneApi_ReportsBackupsOffAndRefusesToRunOne()
    {
        using var client = _factory.CreateClient();

        var status = await client.GetFromJsonAsync<BackupStatusResponse>("/api/backups/status");
        var run = await client.PostAsync("/api/backups", null);

        Assert.Equal(new BackupStatusResponse(false, null, false, null), status);
        Assert.Equal(HttpStatusCode.NotFound, run.StatusCode);
        Assert.False(Directory.Exists(Path.Combine(Path.GetDirectoryName(_factory.DatabasePath)!, "backups")));
    }
}
