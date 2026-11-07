using System.Reflection;

namespace EggsApp.Api.Hosting;

/// <summary>
/// The app's version, from &lt;Version&gt; in Directory.Build.props, which every project shares.
/// </summary>
public static class AppVersion
{
    /// <summary>With the commit the SDK appends, like "1.0.0+b21b0da…": for the log.</summary>
    public static string Full { get; } = typeof(AppVersion).Assembly
        .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";

    /// <summary>Just "1.0.0": what the footer shows and the installer is named after.</summary>
    public static string Display { get; } = Full.Split('+')[0];
}
