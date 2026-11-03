using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace EggsApp.Tests.Features.SpaHosting;

/// <summary>
/// Each test uses its own temporary web root, so results never depend on a local "pnpm build".
/// </summary>
public sealed class SpaHostingTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string IndexHtml = "<!doctype html><title>spa-hosting-test</title>";

    private readonly string _webRoot = Directory.CreateTempSubdirectory("eggsapp-webroot-").FullName;

    public void Dispose() => Directory.Delete(_webRoot, recursive: true);

    private HttpClient CreateClient() =>
        factory.WithWebHostBuilder(builder => builder.UseWebRoot(_webRoot)).CreateClient();

    private HttpClient CreateClientWithIndexHtml()
    {
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), IndexHtml);
        return CreateClient();
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/ventas")]
    [InlineData("/ventas/nueva")]
    public async Task UiRoute_ReturnsIndexHtml(string path)
    {
        var client = CreateClientWithIndexHtml();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(IndexHtml, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/ventas")]
    public async Task IndexHtml_MustBeRevalidated(string path)
    {
        var client = CreateClientWithIndexHtml();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoCache);
    }

    [Fact]
    public async Task HashedAsset_IsNotMarkedNoCache()
    {
        var assets = Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllText(Path.Combine(assets.FullName, "index-abc123.js"), "console.log('app')");
        var client = CreateClient();

        var response = await client.GetAsync("/assets/index-abc123.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEqual(true, response.Headers.CacheControl?.NoCache);
    }

    [Fact]
    public async Task MissingAsset_ReturnsNotFound()
    {
        var client = CreateClientWithIndexHtml();

        var response = await client.GetAsync("/assets/missing.js");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ApiRoutes_AreNotCaughtByTheFallback()
    {
        var client = CreateClientWithIndexHtml();

        var health = await client.GetAsync("/api/health");
        var unknown = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Equal("application/json", health.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task WithoutFrontendBuild_ApiStillWorks()
    {
        var client = CreateClient();

        var health = await client.GetAsync("/api/health");
        var root = await client.GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, root.StatusCode);
    }
}
