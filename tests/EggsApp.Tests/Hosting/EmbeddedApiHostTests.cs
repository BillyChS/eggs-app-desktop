using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using EggsApp.Api.Data;
using EggsApp.Api.Features.Backups;
using EggsApp.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;

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

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        Directory.Delete(_root, recursive: true);
    }

    private string DatabasePath => Path.Combine(_root, "eggs.db");

    private string DailyFolder => Path.Combine(_root, "backups", DatabaseBackups.DailyFolder);

    private string TodaysBackup => Path.Combine(DailyFolder, BackupFiles.DailyName("eggs", DateOnly.FromDateTime(_now())));

    private Func<DateTime> _now = () => DateTime.Now;

    /// <summary>
    /// The second location is off unless a test sets one: the default is the real OneDrive of whoever runs the tests.
    /// </summary>
    private Task<EmbeddedApiHost> StartHostAsync(Action<WebApplicationBuilder>? configure = null) =>
        EmbeddedApiHost.StartAsync(_root, _webRoot, DatabasePath, _log, builder =>
        {
            builder.Configuration[BackupSettings.SecondFolderKey] = BackupSettings.Off;
            builder.Configuration[BackupSettings.OneDriveKey] = null;
            builder.Services.AddSingleton(new BackupClock(() => _now()));
            configure?.Invoke(builder);
        });

    private string ReadLog() => Directory.Exists(_log.Directory)
        ? string.Concat(Directory.GetFiles(_log.Directory).Select(File.ReadAllText))
        : "";

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);

        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "Timed out waiting.");
            await Task.Delay(50);
        }
    }

    private static string? MarkerIn(string path)
    {
        using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Value FROM Marker";
        return command.ExecuteScalar() as string;
    }

    private void WriteMarker(string value)
    {
        using var connection = new SqliteConnection($"Data Source={DatabasePath};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"CREATE TABLE IF NOT EXISTS Marker (Value TEXT); DELETE FROM Marker; INSERT INTO Marker VALUES ('{value}');";
        command.ExecuteNonQuery();
    }

    private static async Task<BackupStatusResponse> GetStatusAsync(EmbeddedApiHost host)
    {
        using var client = new HttpClient { BaseAddress = host.Url };
        return (await client.GetFromJsonAsync<BackupStatusResponse>("/api/backups/status"))!;
    }

    [Fact]
    public async Task Start_MakesTodaysBackupInTheBackground()
    {
        await using var host = await StartHostAsync();

        await WaitUntilAsync(() => File.Exists(TodaysBackup));

        var status = await GetStatusAsync(host);
        Assert.True(status.Enabled);
        Assert.NotNull(status.LastGoodAt);
        Assert.False(status.Warning);
        Assert.Null(status.SecondCopy);
    }

    [Fact]
    public async Task Start_WhenTodaysBackupExists_DoesNotMakeAnother()
    {
        await (await StartHostAsync()).DisposeAsync();
        var written = File.GetLastWriteTimeUtc(TodaysBackup);
        WriteMarker("after closing");

        await using var host = await StartHostAsync();
        await Task.Delay(500);

        Assert.Equal(written, File.GetLastWriteTimeUtc(TodaysBackup));
    }

    [Fact]
    public async Task Dispose_MakesAFinalBackupWithTheLatestData()
    {
        var host = await StartHostAsync();
        await WaitUntilAsync(() => File.Exists(TodaysBackup));

        WriteMarker("written before closing");
        await host.DisposeAsync();

        Assert.Equal("written before closing", MarkerIn(TodaysBackup));
        Assert.Contains("Backup made (closing) and verified", ReadLog());
    }

    [Fact]
    public async Task HourlyCheck_MakesTheNextDaysBackup()
    {
        var day = DateTime.Now.Date.AddHours(23).AddMinutes(30);
        _now = () => day;

        await using var host = await StartHostAsync(builder =>
            builder.Configuration[BackupSettings.CheckIntervalKey] = "00:00:00.200");
        await WaitUntilAsync(() => File.Exists(TodaysBackup));

        day = day.AddHours(1);

        await WaitUntilAsync(() => File.Exists(TodaysBackup));
        Assert.Equal(2, Directory.GetFiles(DailyFolder).Length);
    }

    [Fact]
    public async Task BackupThatFails_DoesNotStopTheAppAndShowsAWarning()
    {
        // A file where the daily backups folder should be.
        Directory.CreateDirectory(Path.GetDirectoryName(DailyFolder)!);
        await File.WriteAllTextAsync(DailyFolder, "");

        var host = await StartHostAsync();
        using var client = new HttpClient { BaseAddress = host.Url };

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
        await WaitUntilAsync(() => ReadLog().Contains("Backup failed (none yet today)"));
        Assert.True((await GetStatusAsync(host)).Warning);

        var retry = await client.PostAsync("/api/backups", null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.True((await retry.Content.ReadFromJsonAsync<BackupStatusResponse>())!.Warning);

        await host.DisposeAsync();
        Assert.Contains("Backup failed (closing)", ReadLog());
    }

    [Fact]
    public async Task Retry_AfterTheProblemIsFixed_ClearsTheWarning()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(DailyFolder)!);
        await File.WriteAllTextAsync(DailyFolder, "");
        await using var host = await StartHostAsync();
        await WaitUntilAsync(() => ReadLog().Contains("Backup failed"));

        File.Delete(DailyFolder);
        using var client = new HttpClient { BaseAddress = host.Url };
        var retry = await client.PostAsync("/api/backups", null);

        var status = (await retry.Content.ReadFromJsonAsync<BackupStatusResponse>())!;
        Assert.False(status.Warning);
        Assert.NotNull(status.LastGoodAt);
        Assert.True(File.Exists(TodaysBackup));
    }

    [Fact]
    public async Task SettingsFile_SetsTheSecondFolder()
    {
        var second = Path.Combine(_root, "usb", "Respaldos");
        Directory.CreateDirectory(Path.GetDirectoryName(second)!);
        await File.WriteAllTextAsync(
            Path.Combine(_root, EmbeddedApiHost.SettingsFileName),
            $$"""{ "Backup": { "SecondFolder": {{System.Text.Json.JsonSerializer.Serialize(second)}} } }""");

        // Without the test default, so the file is what decides.
        await using var host = await EmbeddedApiHost.StartAsync(_root, _webRoot, DatabasePath, _log, builder =>
            builder.Configuration[BackupSettings.OneDriveKey] = null);

        await WaitUntilAsync(() => File.Exists(Path.Combine(second, Path.GetFileName(TodaysBackup))));
        var status = await GetStatusAsync(host);
        Assert.False(status.SecondCopy!.IsOneDrive);
    }

    [Fact]
    public async Task SettingsFileWithAMistake_IsIgnoredAndLogged()
    {
        await File.WriteAllTextAsync(Path.Combine(_root, EmbeddedApiHost.SettingsFileName), "{ \"Backup\": ");

        await using var host = await StartHostAsync();

        Assert.Contains("settings.json could not be read and was ignored", ReadLog());
        await WaitUntilAsync(() => File.Exists(TodaysBackup));
    }

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

        await Assert.ThrowsAsync<FrontendNotFoundException>(() => StartHostAsync());
    }

    [Fact]
    public async Task Start_MigratesTheGivenDatabaseAndLogsIt()
    {
        await using var host = await StartHostAsync();

        Assert.True(File.Exists(DatabasePath));
        Assert.Contains("Applied migrations:", ReadLog());
    }

    [Fact]
    public async Task Start_WhenTheDatabaseCantBePrepared_ThrowsAndNeverListens()
    {
        var garbage = new byte[8192];
        Array.Fill(garbage, (byte)'x');
        await File.WriteAllBytesAsync(DatabasePath, garbage);

        await Assert.ThrowsAsync<DatabaseMigrationException>(() => StartHostAsync());
    }

    [Fact]
    public async Task Dispose_LeavesAllDataInTheDatabaseFile()
    {
        var host = await StartHostAsync();
        Assert.True(File.Exists(DatabasePath));

        await host.DisposeAsync();

        Assert.False(File.Exists(DatabasePath + "-wal"));
        Assert.False(File.Exists(DatabasePath + "-shm"));
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
