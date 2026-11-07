using System.Net;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Backups;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Data.Sqlite;

namespace EggsApp.Api.Hosting;

/// <summary>
/// The API running inside another process (the desktop app), on 127.0.0.1 and a port chosen by the OS.
/// </summary>
public sealed class EmbeddedApiHost : IAsyncDisposable
{
    // Blocks DNS rebinding: a website that resolves its own name to 127.0.0.1 is rejected by its Host header.
    private const string AllowedHosts = "127.0.0.1;localhost";

    private const string LogSource = "API";

    public const string SettingsFileName = "settings.json";

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
    /// <exception cref="DatabaseMigrationException">The database could not be brought up to date.</exception>
    /// <param name="configure">For tests: runs last, so it can replace any setting or service.</param>
    public static async Task<EmbeddedApiHost> StartAsync(
        string contentRoot,
        string webRoot,
        string databasePath,
        FailureLog log,
        Action<WebApplicationBuilder>? configure = null)
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

        builder.Services.AddSingleton(log);
        builder.AddEggsApp();
        builder.Configuration.AddInMemoryCollection([new(BackupSettings.EnabledKey, "true")]);
        AddSettingsFile(builder.Configuration, Path.Combine(Path.GetDirectoryName(databasePath)!, SettingsFileName), log);
        builder.Configuration["AllowedHosts"] = AllowedHosts;
        builder.Configuration[EggsAppHostExtensions.DatabasePathKey] = databasePath;
        builder.Logging.AddProvider(new FailureLogLoggerProvider(log));
        builder.Services.Configure<HostOptions>(options => options.ShutdownTimeout = ShutdownTimeout);

        // Port 0: the OS picks a free port while binding, so nothing can take it between choosing and listening.
        builder.WebHost.ConfigureKestrel(kestrel => kestrel.Listen(IPAddress.Loopback, 0));

        configure?.Invoke(builder);

        var app = builder.Build();

        try
        {
            var migration = await app.MigrateDatabaseAsync();

            if (migration.AppliedMigrations.Count > 0)
            {
                log.Write(
                    LogSource,
                    $"Applied migrations: {string.Join(", ", migration.AppliedMigrations)}. "
                    + $"Copy made before migrating: {migration.BackupPath ?? "none, the database was new"}.");
            }

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

    // Billy's settings for this PC, next to the database. Only Backup:SecondFolder is meant to be set there.
    // A mistake in the file must not keep the app from opening, so it is logged and ignored.
    private static void AddSettingsFile(ConfigurationManager configuration, string path, FailureLog log)
    {
        if (!File.Exists(path))
        {
            return;
        }

        try
        {
            // Read here, not with AddJsonFile: a source that fails to load would fail again on every rebuild.
            var settings = new ConfigurationBuilder().AddJsonFile(path, optional: false, reloadOnChange: false).Build();
            configuration.AddConfiguration(settings);
        }
        catch (Exception exception)
        {
            log.Write(LogSource, $"{path} could not be read and was ignored.", exception);
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

        // After stopping, so no request can still be writing: the day's last backup has everything. It never throws.
        var backups = _app.Services.GetRequiredService<DatabaseBackups>();

        if (backups.Settings.Enabled)
        {
            await backups.RunAsync(BackupReason.Closing);
        }

        await _app.DisposeAsync();

        // Closing the last connection moves everything from eggs.db-wal into eggs.db.
        SqliteConnection.ClearAllPools();
    }
}
