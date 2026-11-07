using EggsApp.Api.Hosting;

namespace EggsApp.Api.Features.Health;

public sealed record HealthResponse(string Status, DateTime Time, string Version);

public static class HealthEndpoint
{
    public static RouteGroupBuilder MapHealth(this RouteGroupBuilder api)
    {
        api.MapGet("/health", () => new HealthResponse("ok", DateTime.Now, AppVersion.Display))
            .WithName("GetHealth");

        return api;
    }
}
