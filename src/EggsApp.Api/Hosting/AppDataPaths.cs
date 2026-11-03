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
}
