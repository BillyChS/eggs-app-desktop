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
        app.UseStaticFiles();

        var api = app.MapGroup("/api");
        api.MapHealth();

        // Unknown /api routes return 404; every other route falls back to the React app.
        app.MapFallback("/api/{**path}", () => Results.NotFound());
        app.MapFallbackToFile("index.html");

        return app;
    }
}
