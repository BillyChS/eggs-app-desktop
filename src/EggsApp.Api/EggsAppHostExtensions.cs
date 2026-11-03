using EggsApp.Api.Features.Health;

namespace EggsApp.Api;

/// <summary>
/// Host setup shared by the standalone API (Program.cs) and the in-process host in EggsApp.Desktop.
/// </summary>
public static class EggsAppHostExtensions
{
    /// <summary>
    /// Registers the application services.
    /// </summary>
    public static WebApplicationBuilder AddEggsApp(this WebApplicationBuilder builder)
    {
        return builder;
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
