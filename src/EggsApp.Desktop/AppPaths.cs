using System.IO;
using System.Reflection;
using EggsApp.Api.Hosting;

namespace EggsApp.Desktop;

internal static class AppPaths
{
    public static string ContentRoot => AppContext.BaseDirectory;

    public static string WebView2UserData => Path.Combine(AppDataPaths.Root, "WebView2");

    /// <summary>
    /// A publish has wwwroot next to the exe. Debug builds fall back to the "pnpm build" output in the API project.
    /// </summary>
    public static string WebRoot
    {
        get
        {
            var published = Path.Combine(AppContext.BaseDirectory, "wwwroot");

            if (File.Exists(Path.Combine(published, "index.html")))
            {
                return published;
            }

            var devWebRoot = typeof(AppPaths).Assembly
                .GetCustomAttributes<AssemblyMetadataAttribute>()
                .FirstOrDefault(attribute => attribute.Key == "DevWebRoot")?.Value;

            return devWebRoot is null ? published : Path.GetFullPath(devWebRoot);
        }
    }
}
