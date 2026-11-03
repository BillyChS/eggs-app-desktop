using System.Net;
using EggsApp.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EggsApp.Tests.Hosting;

public sealed class FailureLogTests : IDisposable
{
    private static readonly DateTime Today = new(2026, 11, 20, 9, 30, 0);

    private readonly string _directory = Directory.CreateTempSubdirectory("eggsapp-log-").FullName;

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    private FailureLog CreateLog() => new(_directory, () => Today);

    private string LogFile(string date) => Path.Combine(_directory, $"eggsapp-{date}.log");

    [Fact]
    public void Write_AppendsMessageAndExceptionToTodaysFile()
    {
        var log = CreateLog();

        log.Write("Desktop", "first", new InvalidOperationException("boom"));
        log.Write("Desktop", "second");

        var text = File.ReadAllText(LogFile("2026-11-20"));
        Assert.Contains("2026-11-20 09:30:00 [Desktop] first", text);
        Assert.Contains("System.InvalidOperationException: boom", text);
        Assert.Contains("[Desktop] second", text);
    }

    [Fact]
    public void Write_CreatesTheDirectory()
    {
        var nested = Path.Combine(_directory, "a", "b");

        new FailureLog(nested, () => Today).Write("Desktop", "message");

        Assert.True(File.Exists(Path.Combine(nested, "eggsapp-2026-11-20.log")));
    }

    [Fact]
    public void Write_KeepsTheLastSevenDaysAndLeavesOtherFilesAlone()
    {
        File.WriteAllText(LogFile("2026-11-14"), "oldest kept");
        File.WriteAllText(LogFile("2026-11-13"), "too old");
        File.WriteAllText(LogFile("not-a-date"), "not ours to delete");
        var unrelated = Path.Combine(_directory, "notes.txt");
        File.WriteAllText(unrelated, "not ours to delete");

        CreateLog().Write("Desktop", "message");

        Assert.True(File.Exists(LogFile("2026-11-14")));
        Assert.False(File.Exists(LogFile("2026-11-13")));
        Assert.True(File.Exists(LogFile("not-a-date")));
        Assert.True(File.Exists(unrelated));
    }

    [Fact]
    public void Write_PrunesAgainWhenTheDayChanges()
    {
        var now = Today;
        var log = new FailureLog(_directory, () => now);
        log.Write("Desktop", "today");
        File.WriteAllText(LogFile("2026-11-14"), "kept today, too old tomorrow");

        now = Today.AddDays(1);
        log.Write("Desktop", "tomorrow");

        Assert.False(File.Exists(LogFile("2026-11-14")));
    }

    [Fact]
    public void Write_StopsAtTheSizeLimit()
    {
        var path = LogFile("2026-11-20");
        File.WriteAllBytes(path, new byte[FailureLog.MaxFileBytes]);

        CreateLog().Write("Desktop", "dropped");

        Assert.Equal(FailureLog.MaxFileBytes, new FileInfo(path).Length);
    }

    [Fact]
    public void Write_NeverThrows()
    {
        // A file where the directory should be: every write fails.
        var blocked = Path.Combine(_directory, "blocked");
        File.WriteAllText(blocked, string.Empty);

        new FailureLog(blocked, () => Today).Write("Desktop", "message", new InvalidOperationException());
    }

    [Fact]
    public async Task UnhandledRequestException_IsWrittenToTheLog()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Environment.EnvironmentName = "Production";
        builder.Logging.AddProvider(new FailureLogLoggerProvider(CreateLog()));
        builder.WebHost.ConfigureKestrel(kestrel => kestrel.Listen(IPAddress.Loopback, 0));

        await using var app = builder.Build();
        app.MapGet("/boom", string () => throw new InvalidOperationException("request boom"));
        await app.StartAsync();

        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!
            .Addresses.Single();

        using var client = new HttpClient { BaseAddress = new Uri(address) };
        var response = await client.GetAsync("/boom");
        await app.StopAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains("request boom", File.ReadAllText(LogFile("2026-11-20")));
    }

    [Fact]
    public void Logger_IgnoresEntriesBelowError()
    {
        using var provider = new FailureLogLoggerProvider(CreateLog());
        var logger = provider.CreateLogger("Test");

        logger.LogWarning("just a warning");

        Assert.False(File.Exists(LogFile("2026-11-20")));
    }
}
