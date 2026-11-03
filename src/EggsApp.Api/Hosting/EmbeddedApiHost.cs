using System.Net;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

namespace EggsApp.Api.Hosting;

/// <summary>
/// The API running inside another process (the desktop app), on 127.0.0.1 and a port chosen by the OS.
/// </summary>
public sealed class EmbeddedApiHost : IAsyncDisposable
{
    // Blocks DNS rebinding: a website that resolves its own name to 127.0.0.1 is rejected by its Host header.
    private const string AllowedHosts = "127.0.0.1;localhost";

    private static readonly TimeSpan ShutdownTimeout = TimeSpan.FromSeconds(5);

    private readonly WebApplication _app;
    private bool _stopped;

    private EmbeddedApiHost(WebApplication app, Uri url)
    {
        _app = app;
        Url = url;
    }

    public Uri Url { get; }

    /// <exception cref="FrontendNotFoundException">The web root has no index.html.</exception>
    public static async Task<EmbeddedApiHost> StartAsync(string contentRoot, string webRoot, FailureLog log)
    {
        if (!File.Exists(Path.Combine(webRoot, "index.html")))
        {
            throw new FrontendNotFoundException(webRoot);
        }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(EmbeddedApiHost).Assembly.GetName().Name,
            ContentRootPath = contentRoot,
            WebRootPath = webRoot,
            EnvironmentName = Environments.Production,
        });

        builder.AddEggsApp();
        builder.Configuration["AllowedHosts"] = AllowedHosts;
        builder.Logging.AddProvider(new FailureLogLoggerProvider(log));
        builder.Services.Configure<HostOptions>(options => options.ShutdownTimeout = ShutdownTimeout);

        // Port 0: the OS picks a free port while binding, so nothing can take it between choosing and listening.
        builder.WebHost.ConfigureKestrel(kestrel => kestrel.Listen(IPAddress.Loopback, 0));

        var app = builder.Build();

        try
        {
            app.UseEggsApp();
            await app.StartAsync();

            var address = app.Services.GetRequiredService<IServer>()
                .Features.Get<IServerAddressesFeature>()!
                .Addresses.Single();

            return new EmbeddedApiHost(app, new Uri(address));
        }
        catch
        {
            await app.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_stopped)
        {
            return;
        }

        _stopped = true;
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
