using EggsApp.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace EggsApp.Tests.Infrastructure;

/// <summary>
/// The standalone API, pointed at a temporary database so tests never open a real one.
/// </summary>
public sealed class EggsAppFactory : WebApplicationFactory<Program>
{
    private readonly TestDatabaseFolder _folder = new();

    public string DatabasePath => _folder.DatabasePath;

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting(EggsAppHostExtensions.DatabasePathKey, _folder.DatabasePath);

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            _folder.Dispose();
        }
    }
}
