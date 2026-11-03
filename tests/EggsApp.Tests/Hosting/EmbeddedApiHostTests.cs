using System.Net;
using System.Net.Sockets;
using EggsApp.Api.Hosting;

namespace EggsApp.Tests.Hosting;

public sealed class EmbeddedApiHostTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("eggsapp-host-").FullName;
    private readonly string _webRoot;
    private readonly FailureLog _log;

    public EmbeddedApiHostTests()
    {
        _webRoot = Directory.CreateDirectory(Path.Combine(_root, "wwwroot")).FullName;
        _log = new FailureLog(Path.Combine(_root, "logs"));
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), "<!doctype html>");
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private Task<EmbeddedApiHost> StartHostAsync() => EmbeddedApiHost.StartAsync(_root, _webRoot, _log);

    [Fact]
    public async Task Start_ListensOnLoopbackOnAPortChosenByTheOs()
    {
        await using var host = await StartHostAsync();

        Assert.Equal("127.0.0.1", host.Url.Host);
        Assert.NotEqual(0, host.Url.Port);

        using var client = new HttpClient { BaseAddress = host.Url };
        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Start_TwoHostsGetDifferentPorts()
    {
        await using var first = await StartHostAsync();
        await using var second = await StartHostAsync();

        Assert.NotEqual(first.Url.Port, second.Url.Port);
    }

    [Fact]
    public async Task Start_ServesTheUiFromTheWebRoot()
    {
        await using var host = await StartHostAsync();
        using var client = new HttpClient { BaseAddress = host.Url };

        var response = await client.GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("<!doctype html>", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Start_WithoutIndexHtml_ThrowsFrontendNotFound()
    {
        File.Delete(Path.Combine(_webRoot, "index.html"));

        await Assert.ThrowsAsync<FrontendNotFoundException>(StartHostAsync);
    }

    [Fact]
    public async Task Dispose_StopsListeningAndFreesThePort()
    {
        var host = await StartHostAsync();
        var port = host.Url.Port;

        await host.DisposeAsync();

        using var client = new HttpClient();
        await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync(host.Url));

        var listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        listener.Stop();
    }

    [Fact]
    public async Task Dispose_CanBeCalledTwice()
    {
        var host = await StartHostAsync();

        await host.DisposeAsync();
        await host.DisposeAsync();
    }

    [Theory]
    [InlineData("127.0.0.1", HttpStatusCode.OK)]
    [InlineData("localhost", HttpStatusCode.OK)]
    [InlineData("evil.example", HttpStatusCode.BadRequest)]
    public async Task HostHeader_OnlyLoopbackNamesAreAllowed(string hostName, HttpStatusCode expected)
    {
        await using var host = await StartHostAsync();
        using var client = new HttpClient { BaseAddress = host.Url };
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        request.Headers.Host = $"{hostName}:{host.Url.Port}";

        var response = await client.SendAsync(request);

        Assert.Equal(expected, response.StatusCode);
    }
}
