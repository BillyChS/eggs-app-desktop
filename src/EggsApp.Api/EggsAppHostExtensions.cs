using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Health;
using EggsApp.Api.Hosting;

namespace EggsApp.Api;

/// <summary>
/// Host setup shared by the standalone API (Program.cs) and the in-process host in EggsApp.Desktop.
/// </summary>
public static class EggsAppHostExtensions
{
    public const string DatabasePathKey = "Database:Path";

    /// <summary>
    /// Registers the application services.
    /// </summary>
    public static WebApplicationBuilder AddEggsApp(this WebApplicationBuilder builder)
    {
        // Read when the context is created: WebApplicationFactory adds its settings only when the host is built.
        builder.Services.AddDbContext<AppDbContext>((services, options) => AppDbContext.Configure(
            options,
            services.GetRequiredService<IConfiguration>()[DatabasePathKey] ?? AppDataPaths.DevDatabase));

        return builder;
    }

    /// <summary>
    /// Brings the database up to date. Run this before the host starts, so no request can reach an old schema.
    /// </summary>
    /// <exception cref="DatabaseMigrationException">The app must not start.</exception>
    public static async Task<DatabaseMigrationResult> MigrateDatabaseAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await DatabaseMigrator.MigrateAsync(db);
    }

    /// <summary>
    /// Configures the request pipeline: /api endpoints plus the built React app from wwwroot.
    /// </summary>
    public static WebApplication UseEggsApp(this WebApplication app)
    {
        app.UseDefaultFiles();
        app.UseStaticFiles(SpaFileOptions);

        var api = app.MapGroup("/api");
        api.MapHealth();
        api.MapCustomers();

        // Unknown /api routes return 404; every other route falls back to the React app.
        app.MapFallback("/api/{**path}", () => Results.NotFound());
        app.MapFallbackToFile("index.html", SpaFileOptions);

        return app;
    }

    // index.html must always be revalidated, because it points to the hashed assets of the current version.
    // Without this, an updated app could keep showing the old UI. Hashed assets change name, so they can be cached.
    private static readonly StaticFileOptions SpaFileOptions = new()
    {
        OnPrepareResponse = context =>
        {
            if (string.Equals(context.File.Name, "index.html", StringComparison.OrdinalIgnoreCase))
            {
                context.Context.Response.Headers.CacheControl = "no-cache";
            }
        },
    };
}
