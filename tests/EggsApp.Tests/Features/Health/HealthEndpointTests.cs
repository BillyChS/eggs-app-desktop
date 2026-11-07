using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Health;
using EggsApp.Tests.Infrastructure;

namespace EggsApp.Tests.Features.Health;

public sealed class HealthEndpointTests(EggsAppFactory factory)
    : IClassFixture<EggsAppFactory>
{
    [Fact]
    public async Task GetHealth_ReturnsOk()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body.Status);
    }

    [Fact]
    public async Task GetHealth_ReturnsTheVersionWithoutTheCommit()
    {
        var client = factory.CreateClient();

        var body = await client.GetFromJsonAsync<HealthResponse>("/api/health");

        Assert.NotNull(body);
        Assert.Matches(@"^\d+\.\d+\.\d+$", body.Version);
        Assert.Equal(typeof(HealthResponse).Assembly.GetName().Version!.ToString(3), body.Version);
    }

    [Fact]
    public async Task UnknownApiRoute_ReturnsNotFound()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
