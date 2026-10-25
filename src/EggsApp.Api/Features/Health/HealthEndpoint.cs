namespace EggsApp.Api.Features.Health;

public sealed record HealthResponse(string Status, DateTime Time);

public static class HealthEndpoint
{
    public static RouteGroupBuilder MapHealth(this RouteGroupBuilder api)
    {
        api.MapGet("/health", () => new HealthResponse("ok", DateTime.Now))
            .WithName("GetHealth");

        return api;
    }
}
