namespace EggsApp.Api.Hosting;

/// <summary>
/// Per-user folders for everything the app writes. Nothing is written next to the exe.
/// </summary>
public static class AppDataPaths
{
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EggsApp");

    public static string Logs { get; } = Path.Combine(Root, "logs");

    /// <summary>The real data, used by the desktop app.</summary>
    public static string Database { get; } = Path.Combine(Root, "eggs.db");

    /// <summary>Used by the standalone API and the "dotnet ef" tools, so development can't touch the real data.</summary>
    public static string DevDatabase { get; } = Path.Combine(Root, "eggs.dev.db");
}
